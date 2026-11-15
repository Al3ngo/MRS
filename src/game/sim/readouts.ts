/**
 * What the screens show about a race, worked out here and handed over as plain data: how long a
 * car's tyres and fuel will last, what the weather is about to do, what a pit stop would offer, and
 * the numbers of a finished race. Screens only draw these; they never reach into the engine.
 *
 * Nothing in this file changes a race. Every function reads the state and returns a fresh value,
 * and none of them draws on the race's luck.
 */
import * as M from './model';
import { startFuel } from './race';
import { lapsToGo, options, type Option } from './strategy';
import { compound, compoundOfKind, dryCompounds } from './tyres';
import { rainAt, settle } from './weather';
import type { CarState, Compound, EnergyMode, RaceState } from './types';

const frac = (value: number): number => value - Math.floor(value);
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Tyre life left, 1 new to 0 finished. Finished is where the engine starts to risk a puncture:
 * teams plan to run a little past a tyre's nominal life, so empty here means truly done.
 */
export const tyreLife = (wear: number): number => clamp01(1 - wear / M.BLOWOUT_WEAR);

/** How comfortably fuel reaches the flag, 0 (it will not) to 1 (with half a lap or more to spare). */
export const fuelComfort = (spareLaps: number): number => clamp01((spareLaps + 0.5) / 1.5);

// ── A car's tyres and fuel, looking ahead ───────────────────────────────────────────────────

export interface CarOutlook {
  /** Laps still to run, the one under way included. */
  lapsLeft: number;
  /** Laps from now to the stop the car is set to make: one it has been called in for, or its plan's next. */
  stopIn: number | null;
  /** Every stop ahead, in laps from now. */
  stops: number[];
  /** Tyre life left (see tyreLife), now (index 0) and after each coming lap. New tyres after each planned stop. */
  tyres: number[];
  /** Fuel left as a share of a full tank, now and after each coming lap, at the engine mode it is in. */
  fuel: number[];
  /** How comfortably the fuel left at each of those points reaches the flag (see fuelComfort). */
  fuelComfort: number[];
  /** Laps of fuel more than the race needs at the standard engine mode; negative if it would run short. */
  fuelSpare: number;
  /** How many laps before the stop (or the flag, with no stop) the tyres wear out; null if they last. */
  tyresShortBy: number | null;
  /** How many laps before the flag the fuel runs out at the engine mode it is in; null if it lasts. */
  fuelShortBy: number | null;
}

/**
 * Seconds of race clock from now until `laps` laps from now: the lap under way at the pace the flag
 * allows, the laps after it at racing speed.
 */
function clockAhead(state: RaceState, laps: number): number {
  const now = state.setup.refLap * (state.flag.kind === 'green' ? 1.08 : 1.45);
  const racing = state.setup.refLap * 1.08;
  return Math.min(laps, 1) * now + Math.max(0, laps - 1) * racing;
}

/**
 * The track as the forecast sees it: wet as it is now, then wetter or drier as the race's coming
 * rain says, drying the way the engine dries it. Gives the average wetness over each stretch asked for.
 */
function trackAhead(state: RaceState): (fromLaps: number, toLaps: number) => number {
  const start = state.time + state.stopped;
  let wet = state.wetness;
  return (fromLaps, toLaps) => {
    const from = clockAhead(state, fromLaps);
    const parts = 6;
    const dt = (clockAhead(state, toLaps) - from) / parts;
    let sum = 0;
    for (let part = 0; part < parts; part++) {
      wet = settle(wet, rainAt(state.rain, start + from + (part + 0.5) * dt), dt);
      sum += wet;
    }
    return sum / parts;
  };
}

/** Tyre wear over one lap at racing speed, as the engine works it out, in clear air. */
function wearPerLap(state: RaceState, car: CarState, tyre: Compound, fuel: number, wetness: number): number {
  const { setup } = state;
  const entrant = setup.grid[car.entrant]!;
  return (
    (M.tyreCare(entrant.ratings.tyres) / tyre.life) *
    M.ENGINE[car.engineMode].tyres *
    M.PUSH[car.push].tyres *
    (1 + M.FUEL_WEAR * (fuel / setup.fullDistanceLaps)) *
    M.overheating(tyre.kind, wetness)
  );
}

/**
 * How a car's tyres and fuel will run to the flag if it carries on as it is: same modes, its plan's
 * stops made, a clear track, and the weather the forecast shows (wet-weather tyres wear fast on a
 * drying track). An estimate for the pit wall, not a promise.
 */
export function carOutlook(state: RaceState, car: CarState): CarOutlook {
  const { setup } = state;
  const lapsLeft = car.status === 'running' || car.status === 'pit' ? lapsToGo(state, car) + (1 - frac(Math.max(0, car.pos))) : 0;
  const steps = Math.ceil(lapsLeft - 1e-9);
  const lapNow = Math.max(1, Math.floor(car.pos) + 1);
  const full = startFuel(setup);
  const burn = M.ENGINE[car.engineMode].burn;

  // The stops ahead, as laps from now, with the tyres each one fits.
  const stops: { at: number; compound: string }[] = [];
  if (car.pitCall) stops.push({ at: 1, compound: car.pitCall.compound });
  for (const stop of car.plan) {
    const at = stop.lap - lapNow + 1;
    if (at >= 1 && at <= steps && !stops.some((other) => other.at === at)) stops.push({ at, compound: stop.compound });
  }
  stops.sort((a, b) => a.at - b.at);
  const stopIn = stops[0]?.at ?? null;

  let tyre = compound(setup, car.tyre);
  let wear = car.wear;
  let fuel = car.fuel;
  const need = (lapsFromNow: number): number => Math.max(0, lapsLeft - lapsFromNow);
  const tyres = [tyreLife(wear)];
  const fuels = [Math.max(0, fuel / full)];
  const comfort = [fuelComfort(fuel - need(0))];
  let wornAt: number | null = wear >= M.BLOWOUT_WEAR ? 0 : null;
  let dryAt: number | null = fuel <= 0 ? 0 : null;
  const track = trackAhead(state);
  for (let lap = 1; lap <= steps; lap++) {
    const share = lap === steps ? lapsLeft - (steps - 1) : 1;
    const wetness = track(lap - 1, lap - 1 + share);
    wear += wearPerLap(state, car, tyre, fuel, wetness) * share;
    fuel -= burn * share;
    if (wornAt === null && wear >= M.BLOWOUT_WEAR && (stopIn === null || lap <= stopIn)) wornAt = lap;
    if (dryAt === null && fuel <= 0) dryAt = lap;
    tyres.push(tyreLife(wear));
    fuels.push(Math.max(0, fuel / full));
    comfort.push(fuelComfort(fuel - need(lap)));
    const stop = stops.find((candidate) => candidate.at === lap);
    if (stop) {
      tyre = compound(setup, stop.compound);
      wear = 0;
      tyres[lap] = 1;
    }
  }
  const target = stopIn ?? lapsLeft;
  return {
    lapsLeft,
    stopIn,
    stops: stops.map((stop) => stop.at),
    tyres,
    fuel: fuels,
    fuelComfort: comfort,
    fuelSpare: car.fuel - (setup.laps - car.pos),
    tyresShortBy: wornAt !== null && wornAt < target ? Math.max(1, Math.round(target - wornAt)) : null,
    fuelShortBy: dryAt !== null ? Math.max(1, Math.round(lapsLeft - dryAt)) : null,
  };
}

// ── The weather to come ─────────────────────────────────────────────────────────────────────

export type ForecastKind = 'dry' | 'cloud' | 'light-rain' | 'heavy-rain';

export interface ForecastLap {
  /** The race lap this is for. */
  lap: number;
  kind: ForecastKind;
  /** Chance of rain on that lap, 0 to 1. */
  chance: number;
}

/**
 * The forecast for the next few laps. It is drawn from the rain the race will really have, and
 * grows less sure the further ahead it looks: a shower in five laps is likely, not certain.
 * `sureness` (0 to 1) is the strategist's: a better one stays sure further ahead.
 */
export function weatherForecast(state: RaceState, laps = 5, sureness = 0.5): ForecastLap[] {
  const fade = 0.1 - 0.06 * sureness;
  const { setup } = state;
  const clock = state.time + state.stopped;
  // On the grid the next lap is the first; once racing, the one after the leader's.
  const leaderLap = state.phase === 'grid' ? 0 : Math.min(setup.laps, state.lap + 1);
  const out: ForecastLap[] = [];
  for (let ahead = 1; ahead <= laps && leaderLap + ahead <= setup.laps; ahead++) {
    const rain = rainAt(state.rain, clock + clockAhead(state, ahead - 0.5));
    let near = 0;
    for (const shift of [-0.6, -0.3, 0.3, 0.6]) near = Math.max(near, rainAt(state.rain, clock + clockAhead(state, ahead - 0.5 + shift)));
    let chance: number;
    if (rain > 0) chance = Math.max(0.6, 0.95 - fade * (ahead - 1));
    else if (near > 0) chance = 0.4;
    else chance = Math.min(0.25, setup.traits.rain * 0.25 + 0.02 * ahead);
    const expected = Math.max(rain, near * 0.6);
    const kind: ForecastKind =
      chance >= 0.5 ? (expected >= 0.45 ? 'heavy-rain' : 'light-rain') : chance >= 0.3 ? 'cloud' : 'dry';
    out.push({ lap: leaderLap + ahead, kind, chance: Math.round(chance * 20) / 20 });
  }
  return out;
}

export interface RaceWeather {
  /** The laps this part of the race covers, from the leader's lap now. */
  from: number;
  to: number;
  kind: ForecastKind;
  /** Chance of rain in this part, 0 to 1. */
  chance: number;
}

/**
 * The weather for the rest of the race in a few parts (the start, the middle and the end, by
 * default): for the briefing before the lights. Drawn from the race's real rain like the lap-by-lap
 * forecast, and less sure the further off a part is; a surer strategist stays surer further ahead.
 */
export function raceWeather(state: RaceState, parts = 3, sureness = 0.5): RaceWeather[] {
  const { setup } = state;
  const clock = state.time + state.stopped;
  const done = state.phase === 'grid' ? 0 : Math.min(setup.laps, state.lap);
  const size = (setup.laps - done) / parts;
  const fade = 0.17 - 0.1 * sureness;
  const out: RaceWeather[] = [];
  for (let part = 0; part < parts && size > 0; part++) {
    const from = part * size;
    let peak = 0;
    for (let sample = 0; sample <= 8; sample++) peak = Math.max(peak, rainAt(state.rain, clock + clockAhead(state, from + (size * sample) / 8)));
    let near = 0;
    for (const edge of [from - size * 0.3, from + size * 1.3]) near = Math.max(near, rainAt(state.rain, clock + clockAhead(state, Math.max(0, edge))));
    let chance: number;
    if (peak > 0) chance = Math.max(0.55, 0.95 - fade * part);
    else if (near > 0) chance = 0.35;
    else chance = Math.min(0.25, setup.traits.rain * 0.25 + 0.03 * part);
    const expected = Math.max(peak, near * 0.6);
    const kind: ForecastKind =
      chance >= 0.5 ? (expected >= 0.45 ? 'heavy-rain' : 'light-rain') : chance >= 0.3 ? 'cloud' : 'dry';
    out.push({
      from: Math.round(done + from) + 1,
      to: Math.round(done + from + size),
      kind,
      chance: Math.round(chance * 20) / 20,
    });
  }
  return out;
}

// ── A pit stop ──────────────────────────────────────────────────────────────────────────────

export interface PitAdvice {
  /** Laps to go after the one under way. */
  lapsAfterThis: number;
  /** Laps on the tyres fitted. */
  tyreLaps: number;
  /** The tyres to offer first: what the weather calls for, or the plan's next. */
  suggested: string;
  /** The car still has to use a second dry tyre type to meet the rules. */
  owesSecondType: boolean;
  /** For each tyre the race has, roughly how many laps it lasts for this driver (dry tyres only). */
  lasts: Record<string, number | null>;
}

export function pitAdvice(state: RaceState, car: CarState): PitAdvice {
  const { setup } = state;
  const entrant = setup.grid[car.entrant]!;
  const fitted = compound(setup, car.tyre);
  const want = M.idealKind(state.wetness);
  const suggested =
    car.pitCall?.compound ??
    (want !== 'dry'
      ? compoundOfKind(setup, want).id
      : (car.plan[0]?.compound ?? (dryCompounds(setup).find((tyre) => tyre.id !== fitted.id) ?? fitted).id));
  const kindOf = (id: string) => compound(setup, id).kind;
  const dryUsed = new Set(car.usedCompounds.filter((id) => kindOf(id) === 'dry'));
  const allDry = car.usedCompounds.every((id) => kindOf(id) === 'dry');
  const lasts: Record<string, number | null> = {};
  for (const tyre of setup.compounds) {
    lasts[tyre.id] = tyre.kind === 'dry' ? Math.round(tyre.life / M.tyreCare(entrant.ratings.tyres)) : null;
  }
  return {
    lapsAfterThis: Math.max(0, setup.laps - Math.max(1, Math.floor(car.pos) + 1)),
    tyreLaps: Math.floor(car.tyreLaps),
    suggested,
    owesSecondType: setup.rules.twoCompoundRule && allDry && dryUsed.size < 2,
    lasts,
  };
}

// ── A finished race, in numbers ─────────────────────────────────────────────────────────────

export interface RaceStats {
  safetyCars: number;
  virtualSafetyCars: number;
  redFlags: number;
  /** Passes fought for on track. */
  overtakes: number;
  /** Passes made on a car in trouble: a mistake, a slow lap, being lapped. */
  overtakesOnTrouble: number;
  pitStops: number;
  /** The lap the first rain fell during the race; null if it never did. */
  rainFromLap: number | null;
  /** Wet enough for wet-weather tyres at some point. */
  wet: boolean;
  /** Wet from the very start. */
  wetFromStart: boolean;
  /** Dry tyre types the race had, softest first. */
  dryTypes: string[];
}

export function raceStats(state: RaceState): RaceStats {
  const count = (type: string): number => state.events.filter((event) => event.type === type).length;
  const passes = state.events.filter((event) => event.type === 'overtake');
  const troubled = passes.filter((event) => event.type === 'overtake' && event.error).length;
  const rain = state.events.find((event) => event.type === 'rain' && event.state === 'started');
  return {
    safetyCars: count('safety-car'),
    virtualSafetyCars: count('virtual-safety-car'),
    redFlags: state.redFlags,
    overtakes: passes.length - troubled,
    overtakesOnTrouble: troubled,
    pitStops: count('pit'),
    rainFromLap: rain ? rain.lap : null,
    wet: state.declaredWet,
    wetFromStart: state.declaredWet && !(rain && rain.time > 60),
    dryTypes: dryCompounds(state.setup).map((tyre) => tyre.name),
  };
}

// ── Choices for the player ──────────────────────────────────────────────────────────────────

/** The quickest few ways to run a whole race for a car, best first, as the pit wall works them out. */
export function planChoices(state: RaceState, car: CarState, count = 6): Option[] {
  const { setup } = state;
  return options(setup, setup.grid[car.entrant]!, setup.laps, {
    current: null,
    used: [],
    ruleApplies: setup.rules.twoCompoundRule,
    maxStops: 3,
    stopCost: setup.traits.pitLoss + 1,
  }).slice(0, count);
}

/** Whether a battery mode can be chosen now: one that spends charge needs some charge to spend. */
export function energyModeOpen(state: RaceState, car: CarState, mode: EnergyMode): boolean {
  if (car.status === 'out' || car.status === 'finished') return false;
  return !(car.battery <= 0 && M.energyEffect(state.setup.rules, mode, true).charge < 0);
}
