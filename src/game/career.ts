/**
 * The career: everything a save slot holds.
 *
 * A career has one team, chosen at the start and kept, as in Golden Lap. It moves through the real
 * calendar a session at a time: practice, qualifying (and the sprint sessions on sprint weekends),
 * the race, then a management phase before the next round. After the last round of a season the
 * season is filed in the career's history and the next begins; after 2026 the career is complete.
 *
 * Everything in here is plain data and pure functions: no DOM, no storage, no clock. Each change to
 * the shape of CareerState bumps SCHEMA_VERSION in save-schema.ts and adds a migration.
 */
import { ROUNDS } from './data/generated/rounds';
import { TEAMS } from './data/generated/entries';
import { RULES } from './data/regulations';
import { FIRST_SEASON, LAST_SEASON } from './data/types';
import { teamColour, shownTeamName } from './data/profiles';
import type { CarSetup, Dial, Hint } from './sim/practice';
import type { QualifyingState } from './sim/qualifying';
import type { RaceState } from './sim/types';
import {
  compact,
  driverStandings,
  teamStandings,
  type Finish,
  type RoundResult,
  type Standing,
} from './season/standings';
import { SESSION_KINDS, nextSession, weekendSessions, type SessionKind } from './season/weekend';

export { FIRST_SEASON, LAST_SEASON };
export type { SessionKind };
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

/** The player's practice: the dials on each car, runs made, and what the driver said last. */
export interface PracticeState {
  dials: Record<string, CarSetup>;
  runs: Record<string, number>;
  hints: Record<string, Record<Dial, Hint> | null>;
  /** The setup each car had on its last run: what the driver's hints refer to. Missing in older saves. */
  tested?: Record<string, CarSetup | null>;
}

/** The round in progress. Cleared at the start of each round. */
export interface Weekend {
  /** Setup quality of the player's cars, 0 to 1, once practice is over. */
  setups: Record<string, number>;
  practice: PracticeState | null;
  qualifying: QualifyingState | null;
  sprintQualifying: QualifyingState | null;
  /** The sprint's result, once run. */
  sprint: Finish[] | null;
  /** A race or sprint under way: kept so that closing the app does not lose it. */
  live: RaceState | null;
}

/** A finished season, as the career's history keeps it. */
export interface SeasonRecord {
  season: number;
  team: string;
  teamName: string;
  drivers: Omit<Standing, 'counts'>[];
  teams: Omit<Standing, 'counts'>[];
}

export interface CareerState {
  /** Stable identity of this playthrough; survives export and import. */
  id: string;
  /** ISO timestamp of when the career was started. */
  createdAt: string;
  /** The player's team, for the whole career; null until it is chosen. */
  team: string | null;
  seasonYear: number;
  /** 1-based round of the season. */
  round: number;
  /** The session that comes next, or is under way. */
  phase: SessionKind;
  sessionsCompleted: number;
  /** True once the last race of the last season has been run. */
  finished: boolean;
  weekend: Weekend;
  /** Results of this season's rounds, in order. */
  results: RoundResult[];
  /** Seasons already completed, oldest first. */
  history: SeasonRecord[];
}

export const emptyWeekend = (): Weekend => ({
  setups: {},
  practice: null,
  qualifying: null,
  sprintQualifying: null,
  sprint: null,
  live: null,
});

export function newCareer(id: string, createdAt: Date): CareerState {
  return {
    id,
    createdAt: createdAt.toISOString(),
    team: null,
    seasonYear: FIRST_SEASON,
    round: 1,
    phase: 'practice',
    sessionsCompleted: 0,
    finished: false,
    weekend: emptyWeekend(),
    results: [],
    history: [],
  };
}

/** Teams a career can be started with: every team on the grid in 2010. */
export const STARTING_TEAMS: readonly string[] = TEAMS.filter((team) => team.seasons[0] <= FIRST_SEASON).map(
  (team) => team.id,
);

export function chooseTeam(state: CareerState, team: string): CareerState {
  if (state.team !== null) return state;
  if (!STARTING_TEAMS.includes(team)) throw new RangeError(`${team} was not on the grid in ${FIRST_SEASON}`);
  return { ...state, team };
}

/** Moves on to the next session of the round. */
function advance(state: CareerState, weekend: Weekend, results = state.results): CareerState {
  const next = nextSession(state.seasonYear, state.round, state.phase) ?? 'management';
  return { ...state, phase: next, weekend, results, sessionsCompleted: state.sessionsCompleted + 1 };
}

/** Practice is over: the player's cars keep the setups found. */
export function finishPractice(state: CareerState, setups: Record<string, number>): CareerState {
  if (state.phase !== 'practice') return state;
  return advance(state, { ...state.weekend, setups, practice: null });
}

/** Keeps practice as it stands, part way through. */
export const savePractice = (state: CareerState, practice: PracticeState): CareerState =>
  state.phase === 'practice' ? { ...state, weekend: { ...state.weekend, practice } } : state;

/** Keeps a qualifying session as it stands; moves on once all three parts are run. */
export function saveQualifying(state: CareerState, session: QualifyingState): CareerState {
  if (state.phase !== 'qualifying' && state.phase !== 'sprint-qualifying') return state;
  const key = state.phase === 'qualifying' ? 'qualifying' : 'sprintQualifying';
  const weekend = { ...state.weekend, [key]: session };
  return session.part === 4 ? advance(state, weekend) : { ...state, weekend };
}

/** Keeps a race or sprint under way. The state is kept as it is, not copied. */
export const saveLive = (state: CareerState, live: RaceState | null): CareerState =>
  ({ ...state, weekend: { ...state.weekend, live } });

const isLastRound = (state: CareerState): boolean => state.round === roundsIn(state.seasonYear);

/**
 * A race or sprint is over: its result is kept, and the career moves on. `pole` is the driver who
 * started the Grand Prix from pole.
 */
export function finishRace(state: CareerState, finishes: Finish[], pole: string | null): CareerState {
  if (state.phase === 'sprint') return advance(state, { ...state.weekend, sprint: finishes, live: null });
  if (state.phase !== 'race') return state;
  const result: RoundResult = { round: state.round, race: finishes, sprint: state.weekend.sprint, pole };
  const next = advance(state, { ...state.weekend, live: null }, [...state.results, result]);
  if (state.seasonYear === LAST_SEASON && isLastRound(state)) next.finished = true;
  return next;
}

/** The record of a season, from its results. */
export function seasonRecord(state: CareerState): SeasonRecord {
  const team = state.team ?? '';
  const fact = TEAMS.find((candidate) => candidate.id === team);
  const name = fact?.names.find((entry) => entry.from <= state.seasonYear && entry.to >= state.seasonYear) ?? fact?.names.at(-1);
  return {
    season: state.seasonYear,
    team,
    teamName: name ? shownTeamName(name.constructor, state.seasonYear, name.name) : team,
    drivers: compact(driverStandings(state.results)),
    teams: compact(teamStandings(state.results)),
  };
}

/**
 * The management phase is over: on to the next round, or, after the last round, to the next season.
 * After the last round of the last season there is nowhere to go.
 */
export function finishManagement(state: CareerState): CareerState {
  if (state.phase !== 'management' || state.finished) return state;
  const base = { ...state, phase: 'practice' as const, weekend: emptyWeekend(), sessionsCompleted: state.sessionsCompleted + 1 };
  if (!isLastRound(state)) return { ...base, round: state.round + 1 };
  return {
    ...base,
    seasonYear: state.seasonYear + 1,
    round: 1,
    results: [],
    history: [...state.history, seasonRecord(state)],
  };
}

/** A whole career's record for the player's team, across every season run so far. */
export interface CareerTotals {
  seasons: SeasonRecord[];
  teamTitles: number;
  driverTitles: number;
  wins: number;
  podiums: number;
  /** Best finishing place in the teams' championship; null before a season is complete. */
  bestPlace: number | null;
}

export function careerTotals(state: CareerState): CareerTotals {
  const seasons = [...state.history, ...(state.finished ? [seasonRecord(state)] : [])];
  const totals: CareerTotals = { seasons, teamTitles: 0, driverTitles: 0, wins: 0, podiums: 0, bestPlace: null };
  for (const record of seasons) {
    const ours = record.teams.find((row) => row.id === state.team);
    if (ours) {
      totals.bestPlace = Math.min(totals.bestPlace ?? Infinity, ours.position);
      if (ours.position === 1) totals.teamTitles += 1;
      totals.wins += ours.wins;
      totals.podiums += ours.podiums;
    }
    if (record.drivers[0]?.team === state.team) totals.driverTitles += 1;
  }
  return totals;
}

/** Races of the current season that have been run. */
export const racesRun = (state: CareerState): number => state.results.length;

/** What a save slot shows without loading the whole career. */
export interface CareerSummary {
  seasonYear: number;
  round: number;
  rounds: number;
  phase: SessionKind;
  racesRun: number;
  sessionsCompleted: number;
  finished: boolean;
  team: string | null;
  teamName: string | null;
  colour: string | null;
}

export function summarise(state: CareerState): CareerSummary {
  let teamName: string | null = null;
  let colour: string | null = null;
  if (state.team) {
    const record = seasonRecord(state);
    teamName = record.teamName;
    const fact = TEAMS.find((candidate) => candidate.id === state.team);
    colour = teamColour(state.team, Math.min(state.seasonYear, fact?.seasons[1] ?? state.seasonYear));
  }
  return {
    seasonYear: state.seasonYear,
    round: state.round,
    rounds: roundsIn(state.seasonYear),
    phase: state.phase,
    racesRun: racesRun(state),
    sessionsCompleted: state.sessionsCompleted,
    finished: state.finished,
    team: state.team,
    teamName,
    colour,
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isWholeNumber = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

const isFinishList = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.every(
    (finish) =>
      isObject(finish) &&
      typeof finish.driver === 'string' &&
      typeof finish.team === 'string' &&
      isWholeNumber(finish.position) &&
      typeof finish.points === 'number',
  );

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
  if (value.team !== null && !(typeof value.team === 'string' && STARTING_TEAMS.includes(value.team))) {
    problems.push('The career is for a team the game does not know.');
  }

  const season = value.seasonYear;
  const seasonOk = isWholeNumber(season) && season >= FIRST_SEASON && season <= LAST_SEASON;
  if (!seasonOk) problems.push(`The season must be between ${FIRST_SEASON} and ${LAST_SEASON}.`);

  let roundOk = false;
  if (!isWholeNumber(value.round) || value.round < 1) {
    problems.push('The round must be 1 or more.');
  } else if (seasonOk && value.round > roundsIn(season)) {
    problems.push(`Season ${season} has ${roundsIn(season)} rounds; the save is on round ${value.round}.`);
  } else {
    roundOk = seasonOk;
  }

  if (!SESSION_KINDS.includes(value.phase as SessionKind)) {
    problems.push('The next session is not one the game knows.');
  } else if (roundOk && !weekendSessions(season as number, value.round as number).includes(value.phase as SessionKind)) {
    problems.push('The next session is not part of this round.');
  }
  if (!isWholeNumber(value.sessionsCompleted) || value.sessionsCompleted < 0) {
    problems.push('The count of completed sessions is not a whole number.');
  }
  if (typeof value.finished !== 'boolean') problems.push('The career does not say whether it has finished.');

  const weekend = value.weekend;
  if (!isObject(weekend) || !isObject(weekend.setups)) {
    problems.push('The career has no record of the round in progress.');
  } else if (weekend.sprint !== null && !isFinishList(weekend.sprint)) {
    problems.push('The sprint result is damaged.');
  }

  if (!Array.isArray(value.results)) {
    problems.push('The season has no results list.');
  } else {
    const bad = value.results.some(
      (result, index, list) =>
        !isObject(result) ||
        !isWholeNumber(result.round) ||
        (index > 0 && !(result.round > ((list[index - 1] as Record<string, unknown>).round as number))) ||
        !isFinishList(result.race) ||
        (result.sprint !== null && !isFinishList(result.sprint)),
    );
    if (bad) problems.push('A result of this season is damaged.');
    else if (roundOk && value.results.some((result) => (result as Record<string, number>).round! > (value.round as number))) {
      problems.push('There are results for rounds not yet reached.');
    }
  }
  if (!Array.isArray(value.history) || !value.history.every((record) => isObject(record) && isWholeNumber(record.season))) {
    problems.push('The history of past seasons is damaged.');
  }
  return problems;
}
