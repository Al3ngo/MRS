/**
 * Knockout qualifying: three parts, the slowest cars dropping out after the first and the second,
 * the last ten or so fighting for pole in the third.
 *
 * Each car gets two runs in a part and its better lap counts. The pit wall's one decision is how
 * hard the driver is told to go: pushing finds time and risks a ruined lap.
 */
import { knockoutCuts } from '../data/regulations';
import * as M from './model';
import { between, chance, clamp, gaussian, type Luck } from './rng';
import type { Entrant, SessionRules, SessionSetup } from './types';

export type Approach = 'safe' | 'normal' | 'push';

export interface QualifyingSetup {
  season: number;
  round: number;
  name: string;
  circuit: string;
  refLap: number;
  traits: SessionSetup['traits'];
  rules: SessionRules;
  entrants: readonly Entrant[];
  /** Fixes how wet the track is at the start (0 to 1). Left out, the seed and the circuit decide. */
  wetness?: number;
}

export interface QualifyingLap {
  car: string;
  /** The car's best lap of the part, in seconds. */
  time: number;
  /** That lap had a mistake in it. */
  error: boolean;
}

export interface QualifyingPart {
  part: 1 | 2 | 3;
  wetness: number;
  /** Fastest first. */
  laps: QualifyingLap[];
  /** Those who go no further, quickest of them first. */
  knockedOut: string[];
}

export interface QualifyingState extends Luck {
  setup: QualifyingSetup;
  /** The part about to be run; 4 when qualifying is over. */
  part: 1 | 2 | 3 | 4;
  wetness: number;
  /** Cars still in, in no particular order. */
  through: string[];
  parts: QualifyingPart[];
}

/** The track rubbers in: each part is quicker than the last, on a dry day. */
const EVOLUTION = [0, 0.0025, 0.0045] as const;
const APPROACH: Readonly<Record<Approach, { pace: number; risk: number }>> = {
  safe: { pace: 0.001, risk: 0.4 },
  normal: { pace: 0, risk: 1 },
  push: { pace: -0.001, risk: 2.2 },
};

export function createQualifying(setup: QualifyingSetup, seed: number): QualifyingState {
  const state: QualifyingState = {
    setup,
    rng: seed | 0,
    part: 1,
    wetness: 0,
    through: setup.entrants.map((entrant) => entrant.id),
    parts: [],
  };
  if (setup.wetness !== undefined) state.wetness = clamp(setup.wetness, 0, 1);
  else if (chance(state, setup.traits.rain * 0.8)) state.wetness = between(state, 0.15, 0.7);
  return state;
}

function flyingLap(state: QualifyingState, entrant: Entrant, approach: Approach, part: number): QualifyingLap {
  const { setup, wetness } = state;
  const ratings = entrant.ratings;
  const kind = M.idealKind(wetness);
  const how = APPROACH[approach];
  let pace =
    M.carDeficit(entrant.car, setup.traits) * (1 - 0.25 * wetness) +
    (1 - entrant.setup) * M.SETUP_COST +
    (100 - ratings.pace) * M.DRIVER_POINT +
    M.gripLoss(kind, wetness) * (wetness > 0.02 ? M.wetSkill(ratings.wet) : 1) +
    how.pace -
    (wetness < M.DRY_LIMIT ? EVOLUTION[part - 1]! : 0) +
    gaussian(state) * M.lapNoise(ratings.consistency) * (1 + wetness);
  const error = chance(state, (0.05 + (100 - ratings.consistency) * 0.004) * how.risk * (1 + wetness));
  if (error) pace += between(state, 0.004, 0.02);
  return { car: entrant.id, time: setup.refLap * (1 + pace), error };
}

/**
 * Runs the next part. `approach` says how hard each car goes; cars not named go at 'normal'.
 * Returns the part's result, which is also added to the state.
 */
export function runPart(state: QualifyingState, approach: Readonly<Record<string, Approach>> = {}): QualifyingPart {
  if (state.part === 4) throw new RangeError('Qualifying is over');
  const { setup } = state;
  const part = state.part;
  const byId = new Map(setup.entrants.map((entrant) => [entrant.id, entrant]));

  const laps = state.through.map((id): QualifyingLap => {
    const entrant = byId.get(id)!;
    const how = approach[id] ?? 'normal';
    const first = flyingLap(state, entrant, how, part);
    const second = flyingLap(state, entrant, how, part);
    return second.time < first.time ? second : first;
  });
  laps.sort((a, b) => a.time - b.time);

  const cuts = knockoutCuts(setup.entrants.length);
  const drop = part === 3 ? 0 : cuts[part - 1]!;
  const keep = laps.length - drop;
  const result: QualifyingPart = {
    part,
    wetness: state.wetness,
    laps,
    knockedOut: laps.slice(keep).map((lap) => lap.car),
  };
  state.parts.push(result);
  state.through = laps.slice(0, keep).map((lap) => lap.car);
  state.part = (part + 1) as 2 | 3 | 4;

  // A wet track changes between parts; a dry one stays dry.
  if (state.wetness > 0) state.wetness = clamp(state.wetness + gaussian(state) * 0.08 - 0.03, 0, 1);
  return result;
}

/** The grid, pole first: the last part's order, then those knocked out in the second, then the first. */
export function gridOrder(state: QualifyingState): string[] {
  if (state.part !== 4) throw new RangeError('Qualifying is not over');
  const [first, second, third] = state.parts;
  return [...third!.laps.map((lap) => lap.car), ...second!.knockedOut, ...first!.knockedOut];
}

/** All three parts, every car at 'normal'. */
export function runQualifying(setup: QualifyingSetup, seed: number): QualifyingState {
  const state = createQualifying(setup, seed);
  while (state.part !== 4) runPart(state);
  return state;
}
