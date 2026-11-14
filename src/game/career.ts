/**
 * The career: everything a save slot holds.
 *
 * STAGES 1-2: this is a stand-in. It knows which season, round and session comes next, and nothing
 * else, which is enough to prove the save system. The calendar it walks is the real one. Later
 * stages grow CareerState (team, drivers, car, money, history); each change to its shape bumps
 * SCHEMA_VERSION and adds a step to MIGRATIONS in save-schema.ts so existing saves keep loading.
 *
 * Everything in here is plain data and pure functions: no DOM, no storage, no clock.
 */

import { ROUNDS } from './data/generated/rounds';
import { RULES } from './data/regulations';
import { FIRST_SEASON, LAST_SEASON } from './data/types';

export { FIRST_SEASON, LAST_SEASON };
export const SEASON_COUNT = LAST_SEASON - FIRST_SEASON + 1;

/** Seasons that open with a major rules reset. The save-slot timeline marks them. */
export const RULES_RESET_SEASONS: readonly number[] = Object.values(RULES)
  .filter((rules) => rules.reset === 'major')
  .map((rules) => rules.season);

/** Races in a season, from the real calendar. */
export function roundsIn(seasonYear: number): number {
  const rounds = ROUNDS[seasonYear];
  if (!rounds) throw new RangeError(`No calendar for season ${seasonYear}`);
  return rounds.length;
}

/** The steps of one round, in order. `phase` in the state is the step that comes next. */
export const WEEKEND_PHASES = ['practice', 'qualifying', 'race', 'management'] as const;
export type WeekendPhase = (typeof WEEKEND_PHASES)[number];

export interface CareerState {
  /** Stable identity of this playthrough; survives export and import. */
  id: string;
  /** ISO timestamp of when the career was started. */
  createdAt: string;
  seasonYear: number;
  /** 1-based round of the season. */
  round: number;
  /** The session that comes next. */
  phase: WeekendPhase;
  sessionsCompleted: number;
  /** True once the last race of the last season has been run. */
  finished: boolean;
}

export function newCareer(id: string, createdAt: Date): CareerState {
  return {
    id,
    createdAt: createdAt.toISOString(),
    seasonYear: FIRST_SEASON,
    round: 1,
    phase: 'practice',
    sessionsCompleted: 0,
    finished: false,
  };
}

/** Completes the session that is next and returns the career as it stands afterwards. */
export function completeSession(state: CareerState): CareerState {
  if (state.finished) return state;
  const next: CareerState = { ...state, sessionsCompleted: state.sessionsCompleted + 1 };
  switch (state.phase) {
    case 'practice':
      next.phase = 'qualifying';
      break;
    case 'qualifying':
      next.phase = 'race';
      break;
    case 'race':
      next.phase = 'management';
      if (state.seasonYear === LAST_SEASON && state.round === roundsIn(state.seasonYear)) {
        next.finished = true;
      }
      break;
    case 'management':
      next.phase = 'practice';
      if (state.round < roundsIn(state.seasonYear)) {
        next.round = state.round + 1;
      } else {
        next.seasonYear = state.seasonYear + 1;
        next.round = 1;
      }
      break;
  }
  return next;
}

/** Races of the current season that have been run. */
export function racesRun(state: CareerState): number {
  return state.phase === 'management' ? state.round : state.round - 1;
}

/** What a save slot shows without loading the whole career. */
export interface CareerSummary {
  seasonYear: number;
  round: number;
  rounds: number;
  phase: WeekendPhase;
  racesRun: number;
  sessionsCompleted: number;
  finished: boolean;
}

export function summarise(state: CareerState): CareerSummary {
  return {
    seasonYear: state.seasonYear,
    round: state.round,
    rounds: roundsIn(state.seasonYear),
    phase: state.phase,
    racesRun: racesRun(state),
    sessionsCompleted: state.sessionsCompleted,
    finished: state.finished,
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isWholeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

/**
 * Checks that a value is a usable CareerState. Returns every problem found, in plain words;
 * an empty list means the career is sound. Saves are checked with this on the way in and out.
 */
export function findProblems(value: unknown): string[] {
  if (!isObject(value)) return ['The save does not contain a career.'];
  const problems: string[] = [];

  if (typeof value.id !== 'string' || value.id.length === 0) problems.push('The career has no id.');
  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) {
    problems.push('The career has no valid start date.');
  }

  const season = value.seasonYear;
  const seasonOk = isWholeNumber(season) && season >= FIRST_SEASON && season <= LAST_SEASON;
  if (!seasonOk) problems.push(`The season must be between ${FIRST_SEASON} and ${LAST_SEASON}.`);

  if (!isWholeNumber(value.round) || value.round < 1) {
    problems.push('The round must be 1 or more.');
  } else if (seasonOk && value.round > roundsIn(season)) {
    problems.push(`Season ${season} has ${roundsIn(season)} rounds; the save is on round ${value.round}.`);
  }

  if (!WEEKEND_PHASES.includes(value.phase as WeekendPhase)) {
    problems.push('The next session is not one the game knows.');
  }
  if (!isWholeNumber(value.sessionsCompleted) || value.sessionsCompleted < 0) {
    problems.push('The count of completed sessions is not a whole number.');
  }
  if (typeof value.finished !== 'boolean') problems.push('The career does not say whether it has finished.');

  return problems;
}
