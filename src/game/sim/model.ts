/**
 * The numbers the simulation runs on, and the small formulas that use them.
 *
 * Everything is expressed as a share of a lap: 0.01 is one percent of the lap time, a little under
 * a second at most circuits. A car's lap time is the weekend's quickest lap times (1 + the sum of
 * everything that slows it down). These are balance values; the tests in tests/sim-balance.test.ts
 * keep the races they produce inside believable ranges.
 */
import type { CarSpec, EnergyMode, EngineMode, PushLevel, SessionRules, SessionSetup } from './types';

// ── Car and driver ──────────────────────────────────────────────────────────────────────────

/** A race lap against a qualifying lap: lower engine modes, tyres looked after, no aid on every straight. */
export const RACE_TRIM = 0.03;
/** One point of car rating. */
export const CAR_POINT = 0.00115;
/** One point of a driver's pace rating. */
export const DRIVER_POINT = 0.00035;
/** A car with no useful setup at all. */
export const SETUP_COST = 0.01;
/** Tyres not yet up to temperature, just out of the pits. */
export const COLD_TYRES = 0.008;
export const COLD_SECONDS = 22;

/** How the car's three qualities count at a circuit: power on the straights, aero in the corners. */
export function carScore(car: CarSpec, traits: SessionSetup['traits']): number {
  const power = 0.16 + 0.07 * traits.power;
  const aero = 0.16 + 0.07 * traits.downforce;
  const chassis = 0.34;
  return (car.power * power + car.aero * aero + car.chassis * chassis) / (power + aero + chassis);
}

export const carDeficit = (car: CarSpec, traits: SessionSetup['traits']): number =>
  (100 - carScore(car, traits)) * CAR_POINT;

/** Spread of a driver's lap times, from his consistency. */
export const lapNoise = (consistency: number): number => 0.0011 + (100 - consistency) * 0.00006;

// ── Tyres ───────────────────────────────────────────────────────────────────────────────────

/** How steeply a tyre falls away once it is past the end of its life. */
export const CLIFF = 0.25;
/** Extra wear with a full tank. */
export const FUEL_WEAR = 0.12;
/** Past this wear a tyre can let go. */
export const BLOWOUT_WEAR = 1.3;

/** Pace lost to wear: a steady fade to the end of the tyre's life, then the cliff. */
export const wearLoss = (wear: number, fade: number): number =>
  fade * wear + (wear > 1 ? CLIFF * (wear - 1) * (wear - 1) : 0);

/** A driver's touch: how quickly he wears a tyre, against an average driver. */
export const tyreCare = (tyres: number): number => 1 + (85 - tyres) * 0.009;

// ── Weather ─────────────────────────────────────────────────────────────────────────────────

export type TyreKind = 'dry' | 'inter' | 'wet';

/** Wetness at which the track counts as wet, and slicks stop being the answer. */
export const DRY_LIMIT = 0.13;

/** Pace lost to the conditions on each kind of tyre, for a track `wetness` wet (0 dry, 1 flooded). */
export function gripLoss(kind: TyreKind, wetness: number): number {
  if (kind === 'dry') return Math.min(0.6, 0.25 * wetness + 2.2 * wetness * wetness);
  if (kind === 'inter') {
    const deep = Math.max(0, wetness - 0.55);
    return 0.055 + 0.1 * wetness + 0.5 * deep * deep;
  }
  return 0.115 + 0.06 * wetness;
}

/** A wet-weather tyre on a drying track overheats: how many times faster it wears. */
export function overheating(kind: TyreKind, wetness: number): number {
  if (kind === 'inter') return 1 + 4 * Math.max(0, 0.2 - wetness) / 0.2;
  if (kind === 'wet') return 1 + 5 * Math.max(0, 0.5 - wetness) / 0.5;
  return 1;
}

/** How much of the wet-track loss a driver suffers: under 1 for a rain master. */
export const wetSkill = (wet: number): number => 1 + (85 - wet) * 0.009;

const KINDS: readonly TyreKind[] = ['dry', 'inter', 'wet'];

/** The kind of tyre that is quickest at this wetness. */
export function idealKind(wetness: number): TyreKind {
  let best: TyreKind = 'dry';
  for (const kind of KINDS) if (gripLoss(kind, wetness) < gripLoss(best, wetness)) best = kind;
  return best;
}

// ── The driver: push levels and stress ──────────────────────────────────────────────────────

export const PUSH_LEVELS: readonly PushLevel[] = ['conserve', 'normal', 'push', 'all-out'];

/**
 * What each push level does: lap time, tyre wear against normal, and stress gained per lap (a
 * negative figure is stress shed). All-out is worth about seven tenths a lap and fills the stress
 * gauge in about three laps: a burst, not a way to run a race.
 */
export const PUSH: Readonly<Record<PushLevel, { pace: number; tyres: number; stress: number; mistakes: number }>> = {
  conserve: { pace: 0.0035, tyres: 0.82, stress: -22, mistakes: 0.85 },
  normal: { pace: 0, tyres: 1, stress: -10, mistakes: 1 },
  push: { pace: -0.0028, tyres: 1.18, stress: 4, mistakes: 1.15 },
  'all-out': { pace: -0.0075, tyres: 1.4, stress: 32, mistakes: 1.4 },
};

/** Stress gained per lap holding off a car within striking distance, at normal. */
export const DEFENDING_STRESS = 10;
/** How much each push level adds to that. */
export const DEFENDING_SHARE: Readonly<Record<PushLevel, number>> = { conserve: 0.5, normal: 1, push: 1.2, 'all-out': 1.5 };
/** Stress shed per lap while the field is slowed. */
export const CAUTION_CALM = 25;
/** Below this, stress does no harm. */
export const STRESS_FREE = 25;
/** Above this, a stressed driver also loses pace: he is ragged. */
export const STRESS_RAGGED = 70;

/** How quickly a driver builds stress: a consistent one keeps his head. */
export const stressBuild = (consistency: number): number => 1 + (85 - consistency) * 0.015;

/** How far into the harmful range a driver's stress is, 0 to 1. */
export const stressShare = (stress: number): number => Math.max(0, (stress - STRESS_FREE) / (100 - STRESS_FREE));

/** How many times likelier a mistake is at this stress: up to six times at the top of the gauge. */
export const stressMistakes = (stress: number): number => 1 + 5 * stressShare(stress) ** 2;

/** Pace lost to stress, as a share of a lap. */
export const stressPace = (stress: number): number => Math.max(0, stress - STRESS_RAGGED) * 0.00012;

// ── Engine and energy ───────────────────────────────────────────────────────────────────────

export const ENGINE: Readonly<Record<EngineMode, { pace: number; burn: number; wear: number; tyres: number }>> = {
  save: { pace: 0.005, burn: 0.92, wear: 0.6, tyres: 0.93 },
  standard: { pace: 0, burn: 1, wear: 1, tyres: 1 },
  push: { pace: -0.0035, burn: 1.07, wear: 1.9, tyres: 1.1 },
};

/** The energy modes a season's cars have. None in 2010; a boost button with KERS; four with a hybrid. */
export function energyModes(recovery: SessionRules['recovery']): readonly EnergyMode[] {
  if (recovery === 'none') return [];
  if (recovery === 'kers') return ['harvest', 'balanced', 'overtake'];
  return ['harvest', 'balanced', 'attack', 'overtake'];
}

export interface EnergyEffect {
  pace: number;
  /** Battery gained per lap, in points of 100. */
  charge: number;
  /** Advantage in a fight for position, in percent of a lap. */
  duel: number;
}

const NO_EFFECT: EnergyEffect = { pace: 0, charge: 0, duel: 0 };

/**
 * What an energy mode does. `close` is whether the car is within a second of the one ahead: from
 * 2026 the overtake boost is only there for a car that is.
 */
export function energyEffect(rules: SessionRules, mode: EnergyMode, close: boolean): EnergyEffect {
  if (rules.recovery === 'none') return NO_EFFECT;
  if (rules.recovery === 'kers') {
    // The boost button: bank the lap's energy, use it as it comes, or spend what is banked.
    if (mode === 'harvest') return { pace: 0.0025, charge: 50, duel: -0.15 };
    if (mode === 'overtake') return { pace: -0.002, charge: -100, duel: 0.45 };
    return NO_EFFECT;
  }
  const scale = rules.energyScale;
  let use = mode;
  if (use === 'overtake' && rules.overtakingAid === 'active-aero' && !close) use = 'attack';
  if (use === 'harvest') return { pace: 0.004 * scale, charge: 14, duel: -0.2 * scale };
  if (use === 'attack') return { pace: -0.0028 * scale, charge: -10, duel: 0.2 * scale };
  if (use === 'overtake') return { pace: -0.005 * scale, charge: -28, duel: 0.5 * scale };
  return NO_EFFECT;
}

/** Battery gained per lap behind the safety car, whatever the mode. */
export const CAUTION_CHARGE = 18;

/** Lap time gained with the rear wing open, at a circuit of average overtaking. */
export const DRS_PACE = 0.0032;
/** Advantage the open wing gives in the fight itself, in percent of a lap. */
export const DRS_DUEL = 0.25;
/** The aid works within this many seconds of the car ahead. */
export const AID_RANGE = 1;

// ── Racing ──────────────────────────────────────────────────────────────────────────────────

/** Pace advantage, in percent, that gives an even chance of a pass in a lap, by the circuit's overtaking score. */
const NEED: readonly number[] = [3.5, 1.9, 1.2, 0.9, 0.7];

/**
 * The chance of completing a pass during one lap spent right behind another car.
 * `advantage` is the attacker's pace advantage in percent of a lap, aids and energy included.
 */
export function passChance(advantage: number, overtaking: number, scramble: boolean): number {
  const need = NEED[Math.round(overtaking) - 1]! * (scramble ? 0.6 : 1);
  return 1 / (1 + Math.exp(-(advantage - need) / (0.2 * need + 0.08)));
}

/** Pace lost in the wake of the car ahead, at full closeness. */
export const dirtyAir = (rules: SessionRules, downforce: number): number =>
  rules.dirtyAir * (0.0012 + 0.0006 * downforce);

/** Chance of a mechanical failure over a full race distance, new engine, standard mode. */
export const failureChance = (reliability: number): number =>
  0.004 + Math.pow((100 - reliability) / 100, 1.6) * 0.5;

/** The reliability rating that gives a team's real share of mechanical retirements. */
export const reliabilityFor = (share: number): number =>
  100 - 100 * Math.pow(Math.max(0, share - 0.004) / 0.5, 1 / 1.6);

/** Stationary time of an ordinary stop with an average crew, by season: stops got quicker. */
export const stopSeconds = (season: number): number => (season <= 2010 ? 4.1 : season <= 2012 ? 3.4 : season <= 2015 ? 2.9 : 2.5);
