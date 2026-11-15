/**
 * Developing the car, Golden Lap style.
 *
 * The car is in parts: aero, chassis and the power unit's engine, and from 2011 its battery and
 * energy recovery (KERS, then ERS). Between races the team can upgrade a part (cheap: a little
 * pace, mostly reliability) or build a new version (dearer: much more pace, but new parts are
 * fragile at first, and each new version of a part costs more than the last that season).
 *
 * The player's car is the real car of that team and season, plus or minus what the team's own
 * work has done. A team starts the season a little behind its real car and, by spending what the
 * real team spent, ends it a little ahead, so it races at its real pace on average. Spending more,
 * or more cleverly, beats history; spending less falls behind it.
 *
 * Money can also go into next season's car. At the turn of the year some of this season's gains
 * carry over (most in a quiet year, little when the rules are rewritten) and the work on the new
 * car counts: in the year before a rules reset (2014, 2017, 2022, 2026) it counts most of all.
 */
import { LAST_SEASON, driversBy, rulesFor, teamSpending, teamsIn } from '../data';
import { clamp } from '../sim/rng';
import type { CarSpec } from '../sim/types';
import { backingFor, driverAsk } from './drivers';
import { engineLease, isWorks, realEngineOf } from './engines';
import { money, seasonIncome } from './money';
import { aeroGainAt, designGainAt, staffAsk } from './staff';
import type { PartId, PartState } from './types';

export const ALL_PARTS: readonly PartId[] = ['aero', 'chassis', 'engine', 'battery', 'recovery'];

/** The parts of a season's cars: no energy recovery in 2010, KERS from 2011, ERS from 2014. */
export const partsIn = (season: number): PartId[] =>
  season <= 2010 ? ['aero', 'chassis', 'engine'] : ['aero', 'chassis', 'engine', 'battery', 'recovery'];

const POWER_PARTS: readonly PartId[] = ['engine', 'battery', 'recovery'];

/**
 * Whether the team may build new versions of a part. Only a works team develops its power unit,
 * and the V8 engines were frozen by the rules until the end of 2013. Upgrades are open to all.
 */
export function canBuild(part: PartId, season: number, works: boolean): boolean {
  if (part === 'aero' || part === 'chassis') return true;
  if (!works) return false;
  return part !== 'engine' || season >= 2014;
}

/** What a new version costs: the first of the season, then 2 more for each one after. */
const BUILD_BASE: Readonly<Record<PartId, number>> = { aero: 8, chassis: 8, engine: 9, battery: 6, recovery: 6 };
const BUILD_STEP = 2;

export const buildCost = (part: PartId, builds: number): number => BUILD_BASE[part] + BUILD_STEP * builds;

/** What an upgrade adds to performance, before staff and penalties. */
export const UPGRADE_GAIN = 0.25;
/** What an upgrade adds to reliability, up to RELIABILITY_CEILING. */
export const UPGRADE_RELIABILITY = 4;
const RELIABILITY_CEILING = 4;
const RELIABILITY_FLOOR = -15;

/** How the power unit's parts add up to its power, by era: from 2026 about half of it is electric. */
export function powerWeights(season: number): Readonly<Record<'engine' | 'battery' | 'recovery', number>> {
  const rules = rulesFor(season);
  if (rules.recovery === 'none') return { engine: 1, battery: 0, recovery: 0 };
  if (rules.recovery === 'kers') return { engine: 0.85, battery: 0.05, recovery: 0.1 };
  if (rules.engine === 'hybrid-2026') return { engine: 0.5, battery: 0.2, recovery: 0.3 };
  return { engine: 0.6, battery: 0.15, recovery: 0.25 };
}

/** New versions a budget pays for on one part, with costs rising by BUILD_STEP each time. */
function buildsFor(budget: number, part: PartId): number {
  const first = BUILD_BASE[part];
  // n first + n(n - 1) = budget, solved for n.
  const b = first - 1;
  return Math.max(0, (-b + Math.sqrt(b * b + 4 * budget)) / 2);
}

/** Share of a typical development budget spent on new parts; the rest goes on upgrades. */
const TYPICAL_BUILD_SHARE = 0.85;

const nextIsMajor = (season: number): boolean => season < LAST_SEASON && rulesFor(season + 1).reset === 'major';

/** The staff skill a team's money buys: the level its starting staff are hired at. */
export const staffLevel = (team: string, season: number): number =>
  35 + 50 * clamp((teamSpending(team, season) - 40) / 200, 0, 1);

/** How the real team's money went, as the game reckons it: the yardstick for the player's season. */
export interface TypicalSeason {
  income: number;
  drivers: number;
  staff: number;
  lease: number;
  nextYear: number;
  development: number;
  works: boolean;
  /** Half the pace a season's typical development adds to each part, in car-rating points. */
  half: Partial<Record<PartId, number>>;
}

const typicalCache = new Map<string, TypicalSeason>();

export function typicalSeason(team: string, season: number): TypicalSeason {
  const key = `${team}|${season}`;
  let found = typicalCache.get(key);
  if (!found) {
    found = workOutTypical(team, season);
    typicalCache.set(key, found);
  }
  return found;
}

function workOutTypical(team: string, season: number): TypicalSeason {
  const income = seasonIncome(team, season);
  const lineup = teamsIn(season).find((entry) => entry.team === team)?.drivers.slice(0, 2) ?? [];
  const field = driversBy(season);
  let drivers = 0;
  for (const { id } of lineup) {
    const entry = field.find((candidate) => candidate.driver.id === id);
    if (entry) drivers += driverAsk(entry) - backingFor(id, season);
  }
  if (lineup.length < 2) drivers += (2 - lineup.length) * 2;
  const staffEach = staffAsk(staffLevel(team, season), []);
  const staff = 5 * staffEach;
  const maker = realEngineOf(team, season) ?? 'cosworth';
  const works = isWorks(team, maker);
  const lease = works ? 0 : engineLease(maker, season);
  const free = Math.max(0, income - drivers - staff - lease);
  let nextYear = free * (nextIsMajor(season) ? 0.3 : 0.1);
  let development = free - nextYear;
  const cap = rulesFor(season).budgetCap;
  if (cap !== null) {
    // The three best-paid staff sit outside the cap; two salaries count, with the lease.
    const room = Math.max(0, cap - 2 * staffEach - lease);
    if (development + nextYear > room) {
      const scale = room / (development + nextYear);
      development *= scale;
      nextYear *= scale;
    }
  }
  // A typical team spends most of it on new parts and the rest keeping them reliable, with the
  // staff its money buys.
  const buildable = partsIn(season).filter((part) => canBuild(part, season, works));
  const level = staffLevel(team, season);
  const half: Partial<Record<PartId, number>> = {};
  for (const part of buildable) {
    const gain = designGainAt(level) * (part === 'aero' ? aeroGainAt(level) : 1);
    half[part] = (buildsFor((development * TYPICAL_BUILD_SHARE) / buildable.length, part) * gain) / 2;
  }
  return {
    income,
    drivers: money(drivers),
    staff: money(staff),
    lease,
    nextYear: money(nextYear),
    development: money(development),
    works,
    half,
  };
}

// Adding zero turns a negative zero into zero, which a save file would otherwise change.
const blank = (perf: number, rel: number): PartState => ({ perf: perf + 0, rel: rel + 0, builds: 0, upgrades: 0 });

/** The parts as a career's first season starts: behind the real car by half a season's work. */
export function freshParts(team: string, season: number): Partial<Record<PartId, PartState>> {
  const typical = typicalSeason(team, season);
  const parts: Partial<Record<PartId, PartState>> = {};
  for (const part of partsIn(season)) parts[part] = blank(-(typical.half[part] ?? 0), 0);
  return parts;
}

/** Share of this season's gains beyond the usual that carries into next year's car. */
const CARRY = { none: 0.5, minor: 0.35, major: 0.1 } as const;

/** What money put into next year's car is worth, against what the real team put in. Car-rating points. */
export function projectEffect(invested: number, typical: number, major: boolean, gain: number): number {
  const k = major ? 1.2 : 0.5;
  return clamp(k * (Math.sqrt(Math.max(0, invested) * gain) - Math.sqrt(Math.max(0, typical))), -6, 6);
}

/**
 * Next season's parts, from this season's: the gains beyond the usual carry over in part, the work
 * on the new car is added, and the new season starts behind its real car by half a season's work.
 */
export function nextSeasonParts(
  parts: Partial<Record<PartId, PartState>>,
  team: string,
  season: number,
  invested: number,
  gain: number,
  works: boolean,
): Partial<Record<PartId, PartState>> {
  const next = season + 1;
  const reset = rulesFor(next).reset;
  const before = typicalSeason(team, season);
  const after = typicalSeason(team, next);
  const project = projectEffect(invested, before.nextYear, reset === 'major', gain);
  const out: Partial<Record<PartId, PartState>> = {};
  for (const part of partsIn(next)) {
    const old = parts[part];
    const excess = old ? old.perf - (before.half[part] ?? 0) : 0;
    const counted = canBuild(part, next, works) ? project : 0;
    out[part] = blank(CARRY[reset] * excess + counted - (after.half[part] ?? 0), reset === 'major' ? -4 : 0);
  }
  return out;
}

/** A new version of a part: `gain` faster, `fragility` less reliable, and the next one dearer. */
export const withBuild = (part: PartState, gain: number, fragility: number): PartState => ({
  ...part,
  perf: part.perf + gain,
  rel: Math.max(RELIABILITY_FLOOR, part.rel - fragility),
  builds: part.builds + 1,
});

/** An upgrade to a part: a little faster, and more reliable. */
export const withUpgrade = (part: PartState, gain: number): PartState => ({
  ...part,
  perf: part.perf + gain,
  rel: Math.min(RELIABILITY_CEILING, part.rel + UPGRADE_RELIABILITY),
  upgrades: part.upgrades + 1,
});

/**
 * The player's car: the real car, plus each part's gains, plus the difference a change of engine
 * supplier makes. `pitCrew` comes from the pit crew chief.
 */
export function playerCar(
  base: CarSpec,
  parts: Partial<Record<PartId, PartState>>,
  season: number,
  supplier: readonly [number, number],
  pitCrew: number,
): CarSpec {
  const weights = powerWeights(season);
  let power = base.power + supplier[0];
  for (const part of POWER_PARTS) power += weights[part as keyof typeof weights] * (parts[part]?.perf ?? 0);
  const present = partsIn(season).map((part) => parts[part]?.rel ?? 0);
  const rel = present.reduce((sum, value) => sum + value, 0) / Math.max(1, present.length);
  return {
    aero: clamp(base.aero + (parts.aero?.perf ?? 0), 1, 100),
    chassis: clamp(base.chassis + (parts.chassis?.perf ?? 0), 1, 100),
    power: clamp(power, 1, 100),
    reliability: clamp(base.reliability + rel + supplier[1], 1, 99),
    pitCrew,
  };
}
