/**
 * The game's reference data, assembled: one place to ask what a season looked like.
 * Facts come from ./generated; the game's own assessments from the hand-written files beside this one.
 */
import { CIRCUITS } from './generated/circuits';
import { DRIVERS } from './generated/drivers';
import { ENTRIES, TEAMS } from './generated/entries';
import { REAL_PACE } from './generated/pace';
import { ROUNDS } from './generated/rounds';
import { SOURCES } from './generated/sources';
import { engineFamily, shownTeamName, teamColour, teamSpending } from './profiles';
import { PROFILES, ageIn, overall, ratingsAtAge, type Ratings } from './ratings';
import { rulesFor, type Rules } from './regulations';
import {
  FIRST_SEASON,
  LAST_SEASON,
  type CircuitFact,
  type DriverFact,
  type RealPace,
  type RoundFact,
} from './types';

export { CIRCUITS, DRIVERS, ENTRIES, REAL_PACE, ROUNDS, SOURCES, TEAMS, FIRST_SEASON, LAST_SEASON };
export * from './profiles';
export * from './ratings';
export * from './regulations';
export type * from './types';

export const SEASONS: readonly number[] = Array.from(
  { length: LAST_SEASON - FIRST_SEASON + 1 },
  (_, i) => FIRST_SEASON + i,
);

const circuitsById = new Map(CIRCUITS.map((circuit) => [circuit.id, circuit]));
const driversById = new Map(DRIVERS.map((driver) => [driver.id, driver]));

export function circuit(id: string): CircuitFact {
  const found = circuitsById.get(id);
  if (!found) throw new RangeError(`Unknown circuit ${id}`);
  return found;
}

export function driver(id: string): DriverFact {
  const found = driversById.get(id);
  if (!found) throw new RangeError(`Unknown driver ${id}`);
  return found;
}

/** The rounds of a season, in order, as they were really held (or are scheduled). */
export function calendar(season: number): readonly RoundFact[] {
  const rounds = ROUNDS[season];
  if (!rounds) throw new RangeError(`No calendar for season ${season}`);
  return rounds;
}

/** "1-3,7" as [1, 2, 3, 7]. */
export function expandRounds(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(',')) {
    const [from, to = from] = part.split('-').map(Number) as [number, number?];
    for (let round = from; round <= (to ?? from); round++) out.push(round);
  }
  return out;
}

/** A team as it stood in one season: the facts, plus the game's colour, name and money for it. */
export interface TeamSeason {
  team: string;
  constructor: string;
  name: string;
  countryCode: string;
  colour: string;
  /** The engine as badged, and the programme actually behind it. */
  engineName: string;
  engineMaker: string;
  /** Spending power in game money, with the season's budget cap applied. */
  spending: number;
  /** How quick and how reliable the real car was. Reference only. */
  real: RealPace | null;
  /** Who really raced for the team that season, most races first. */
  drivers: readonly { id: string; rounds: readonly number[] }[];
}

export function teamsIn(season: number): readonly TeamSeason[] {
  const entries = ENTRIES[season];
  if (!entries) throw new RangeError(`No entries for season ${season}`);
  const cap = rulesFor(season).budgetCap;
  return entries.map((entry) => {
    const spending = teamSpending(entry.team, season);
    return {
      team: entry.team,
      constructor: entry.constructor,
      name: shownTeamName(entry.constructor, season, entry.name),
      countryCode: entry.countryCode,
      colour: teamColour(entry.team, season),
      engineName: entry.engineName,
      engineMaker: engineFamily(entry.engine),
      spending: cap === null ? spending : Math.min(spending, cap),
      real: REAL_PACE[season]?.[entry.team] ?? null,
      drivers: entry.drivers
        .map(({ id, rounds }) => ({ id, rounds: expandRounds(rounds) }))
        .sort((a, b) => b.rounds.length - a.rounds.length || a.rounds[0]! - b.rounds[0]!),
    };
  });
}

/** A driver as he stands in one season. */
export interface DriverSeason {
  driver: DriverFact;
  age: number;
  ratings: Ratings;
  overall: number;
  /** True in the season of his first ever race. */
  rookie: boolean;
}

/**
 * Every real driver who is in the sport by a given season: he has made his debut, or makes it that
 * year. Who is still racing later on is for the career to decide, so nobody is removed here.
 */
export function driversBy(season: number): readonly DriverSeason[] {
  return DRIVERS.filter((candidate) => candidate.debut <= season)
    .map((candidate) => {
      const age = ageIn(candidate, season);
      const profile = PROFILES[candidate.id];
      if (!profile) throw new RangeError(`No ratings for driver ${candidate.id}`);
      const ratings = ratingsAtAge(profile, age);
      return { driver: candidate, age, ratings, overall: overall(ratings), rookie: candidate.debut === season };
    })
    .sort((a, b) => b.overall - a.overall || a.driver.lastName.localeCompare(b.driver.lastName));
}

/** The two drivers who started the first race of the season for each team: the grid a career begins with. */
export function openingGrid(season: number): readonly { team: string; drivers: readonly string[] }[] {
  return teamsIn(season).map((team) => ({
    team: team.team,
    drivers: team.drivers.filter((entry) => entry.rounds.includes(1)).map((entry) => entry.id),
  }));
}

export interface SeasonData {
  season: number;
  rules: Rules;
  calendar: readonly RoundFact[];
  teams: readonly TeamSeason[];
}

export function seasonData(season: number): SeasonData {
  return { season, rules: rulesFor(season), calendar: calendar(season), teams: teamsIn(season) };
}
