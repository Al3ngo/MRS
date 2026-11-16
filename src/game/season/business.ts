/**
 * The team's business as the screens show it, worked out here and handed over as plain data: the
 * car against the field, each part's state and costs, the power units against the allowance, the
 * money and the budget cap. Screens only draw these.
 */
import type { CareerState } from '../career';
import { LAST_SEASON, rulesFor, teamsIn } from '../data';
import { CAR_POINT } from '../sim/model';
import { realCar } from '../sim/session';
import type { CarSpec } from '../sim/types';
import {
  buildCost,
  canBuild,
  cappedSpend,
  capRoom,
  engineWorn,
  batteryWorn,
  expectedGain,
  ledgerTotals,
  partsIn,
  penaltyForUnit,
  pitCrewRating,
  playerCar,
  powerWeights,
  typicalSeason,
  upgradeCost,
  worksTeam,
  type LedgerKind,
  type PartId,
} from '../team';
import { baseCar, supplierDelta } from './grid';

/** The player's car as it stands. */
export function playerCarNow(career: CareerState): CarSpec | null {
  const { outfit, team, seasonYear: season } = career;
  if (!outfit || !team) return null;
  return playerCar(baseCar(team, season), outfit.parts, season, supplierDelta(outfit, team, season), pitCrewRating(outfit));
}

export type Quality = 'aero' | 'chassis' | 'power' | 'reliability';

export interface QualityRow {
  quality: Quality;
  /** 1 for the best on the grid. */
  rank: number;
  of: number;
  /** Where it sits between the worst (0) and the best (1) on the grid. */
  share: number;
}

/** How the player's car compares with every other car on the grid, quality by quality. */
export function carAgainstField(career: CareerState): QualityRow[] {
  const mine = playerCarNow(career);
  if (!mine || !career.team) return [];
  const season = career.seasonYear;
  const others = teamsIn(season)
    .filter((entry) => entry.team !== career.team)
    .map((entry) => realCar(season, entry.team));
  const cars = [mine, ...others];
  return (['aero', 'chassis', 'power', 'reliability'] as const).map((quality) => {
    const values = cars.map((car) => car[quality]);
    const value = mine[quality];
    const best = Math.max(...values);
    const worst = Math.min(...values);
    return {
      quality,
      rank: 1 + values.filter((other) => other > value + 1e-9).length,
      of: cars.length,
      share: best - worst < 1e-9 ? 1 : (value - worst) / (best - worst),
    };
  });
}

/** Where one part puts the car against the field: 1st is the best on the grid. */
export interface PartLevel {
  rank: number;
  of: number;
  /** Between the worst (0) and the best (1) on the grid. */
  share: number;
}

/**
 * Each part's level against the field. Aero and chassis are the car's own aero and chassis. The
 * engine, battery and energy recovery share the car's power, so each is the power the car would
 * have if all three were as far along as that one: a part that lags shows lower than the others.
 */
export function partLevels(career: CareerState): Partial<Record<PartId, PartLevel>> {
  const mine = playerCarNow(career);
  const { outfit, team, seasonYear: season } = career;
  if (!mine || !outfit || !team) return {};
  const others = teamsIn(season)
    .filter((entry) => entry.team !== team)
    .map((entry) => realCar(season, entry.team));
  const level = (value: number, field: readonly number[]): PartLevel => {
    const values = [value, ...field];
    const best = Math.max(...values);
    const worst = Math.min(...values);
    return {
      rank: 1 + field.filter((other) => other > value + 1e-9).length,
      of: values.length,
      share: best - worst < 1e-9 ? 1 : Math.min(1, Math.max(0, (value - worst) / (best - worst))),
    };
  };
  const weights = powerWeights(season);
  const powerParts = partsIn(season).filter((part): part is keyof typeof weights => part in weights);
  const weightTotal = powerParts.reduce((sum, part) => sum + weights[part], 0);
  const withoutParts = mine.power - powerParts.reduce((sum, part) => sum + weights[part] * (outfit.parts[part]?.perf ?? 0), 0);
  const levels: Partial<Record<PartId, PartLevel>> = {};
  for (const part of partsIn(season)) {
    if (part === 'aero') levels.aero = level(mine.aero, others.map((car) => car.aero));
    else if (part === 'chassis') levels.chassis = level(mine.chassis, others.map((car) => car.chassis));
    else {
      const power = withoutParts + weightTotal * (outfit.parts[part]?.perf ?? 0);
      levels[part] = level(power, others.map((car) => car.power));
    }
  }
  return levels;
}

/** Whether the team can work on the car now: between races, or before the season's first session. */
export function canDevelop(career: CareerState): boolean {
  if (!career.outfit || career.finished) return false;
  if (career.phase === 'management') return true;
  return career.round === 1 && career.phase === 'practice' && career.weekend.practice === null;
}

export interface PartView {
  part: PartId;
  /** Performance against the real car, in car-rating points. */
  perf: number;
  /** Reliability, 0 (as fragile as it gets) to 1 (as sound as upgrades make it). */
  soundness: number;
  buildable: boolean;
  /** Why it cannot be rebuilt, when it cannot. */
  locked: 'frozen' | 'supplier' | null;
  buildCost: number;
  upgradeCost: number;
  /** What a new version is expected to gain. */
  gain: number;
  builds: number;
  upgrades: number;
}

export function partViews(career: CareerState): PartView[] {
  const { outfit, team, seasonYear: season } = career;
  if (!outfit || !team) return [];
  const works = worksTeam(outfit, team);
  return partsIn(season).map((part) => {
    const state = outfit.parts[part] ?? { perf: 0, rel: 0, builds: 0, upgrades: 0 };
    const buildable = canBuild(part, season, works);
    const locked = buildable ? null : !works && part !== 'aero' && part !== 'chassis' ? 'supplier' : 'frozen';
    return {
      part,
      perf: state.perf,
      soundness: Math.min(1, Math.max(0, (state.rel + 15) / 19)),
      buildable,
      locked,
      buildCost: buildCost(part, state.builds),
      upgradeCost: upgradeCost(outfit),
      gain: expectedGain(outfit, part),
      builds: state.builds,
      upgrades: state.upgrades,
    };
  });
}

export interface UnitView {
  seat: number;
  driver: string;
  engines: number;
  engineAllowance: number;
  /** Wear on the fitted engine, 0 (new) to 1 (done). */
  engineWorn: number;
  /** Grid places another engine would cost. */
  nextEnginePenalty: number;
  batteries: number;
  batteryAllowance: number | null;
  batteryWorn: number;
  nextBatteryPenalty: number;
  /** Grid places already due at the next Grand Prix. */
  penalty: number;
}

export function unitViews(career: CareerState): UnitView[] {
  const { outfit, seasonYear: season } = career;
  if (!outfit) return [];
  const rules = rulesFor(season);
  return outfit.drivers.slice(0, 2).map((contract, seat) => {
    const unit = outfit.units[seat] ?? { engineWear: 0, engines: 1, batteryWear: 0, batteries: 0 };
    return {
      seat,
      driver: contract.driver,
      engines: unit.engines,
      engineAllowance: rules.engineAllowance,
      engineWorn: engineWorn(unit, season),
      nextEnginePenalty: penaltyForUnit('engine', unit.engines + 1, season),
      batteries: unit.batteries,
      batteryAllowance: rules.batteryAllowance,
      batteryWorn: rules.batteryAllowance === null ? 0 : batteryWorn(unit, season),
      nextBatteryPenalty: penaltyForUnit('battery', unit.batteries + 1, season),
      penalty: outfit.penalties[seat] ?? 0,
    };
  });
}

export interface MoneyView {
  money: number;
  /** This season so far. */
  earned: number;
  spent: number;
  byKind: Partial<Record<LedgerKind, number>>;
  cap: number | null;
  capUsed: number;
  capRoom: number | null;
}

export function moneyView(career: CareerState): MoneyView | null {
  const { outfit, seasonYear: season } = career;
  if (!outfit) return null;
  const earned = outfit.ledger.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
  const spent = -outfit.ledger.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0);
  return {
    money: outfit.money,
    earned: Math.round(earned * 10) / 10,
    spent: Math.round(spent * 10) / 10,
    byKind: ledgerTotals(outfit),
    cap: rulesFor(season).budgetCap,
    capUsed: cappedSpend(outfit),
    capRoom: capRoom(outfit, season),
  };
}

export interface NextYearView {
  season: number;
  invested: number;
  /** What a team with this team's money usually puts in by now. */
  usual: number;
  /** The rules change a lot next year: the work counts for much more. */
  major: boolean;
}

export function nextYearView(career: CareerState): NextYearView | null {
  const { outfit, team, seasonYear: season } = career;
  if (!outfit || !team || season >= LAST_SEASON) return null;
  return {
    season: season + 1,
    invested: outfit.nextYear,
    usual: typicalSeason(team, season).nextYear,
    major: rulesFor(season + 1).reset === 'major',
  };
}

/**
 * What a gain in one part is worth on an ordinary lap (90 seconds, a circuit neither fast nor
 * twisty), in seconds: a way to say how big a step is.
 */
export function lapSeconds(part: PartId, points: number, season: number): number {
  const share = { aero: 0.37 / 1.08, chassis: 0.34 / 1.08, power: 0.37 / 1.08 };
  const weights = powerWeights(season);
  const weight = part === 'aero' || part === 'chassis' ? share[part] : share.power * weights[part];
  return points * weight * CAR_POINT * 90;
}
