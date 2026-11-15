/**
 * Sessions built from the record: a real round of a real season, with the cars and drivers that
 * were there. This is what a quick race uses, what a career starts from, and what the balance
 * tests run thousands of times.
 */
import {
  DRIVERS,
  LAST_SEASON,
  PROFILES,
  REAL_PACE,
  SOURCES,
  ageIn,
  calendar,
  circuitTraits,
  teamStyle,
  ratingsAtAge,
  rulesFor,
  teamsIn,
  type Ratings,
  type TeamSeason,
} from '../data';
import * as M from './model';
import { between, clamp, gaussian, seedFrom, type Luck } from './rng';
import { compoundsFor } from './tyres';
import type { CarSpec, Entrant, SessionRules, SessionSetup } from './types';

const driversById = new Map(DRIVERS.map((driver) => [driver.id, driver]));

/** How much following another car costs, by generation of car: worst from 2017, best in 2022. */
function wake(season: number): number {
  if (season <= 2016) return 1;
  if (season <= 2018) return 1.7;
  if (season <= 2021) return 1.25;
  if (season <= 2023) return 0.8;
  if (season <= 2025) return 1.3;
  return 0.85;
}

/** The part of a season's rulebook the simulation runs on. */
export function sessionRules(season: number, kind: 'race' | 'sprint'): SessionRules {
  const rules = rulesFor(season);
  return {
    season,
    recovery: rules.recovery,
    energyScale: rules.engine === 'hybrid-2026' ? 1.5 : 1,
    overtakingAid: rules.overtakingAid,
    virtualSafetyCar: rules.virtualSafetyCar,
    dirtyAir: wake(season),
    twoCompoundRule: kind === 'race',
    // A full tank weighed most in the V8 years and weighs least with the 2026 engines.
    fuelEffect: rules.engine === 'v8' ? 0.045 : rules.engine === 'hybrid' ? 0.034 : 0.028,
  };
}

export function ratingsIn(driverId: string, season: number): Ratings {
  const fact = driversById.get(driverId);
  const profile = PROFILES[driverId];
  if (!fact || !profile) throw new RangeError(`Unknown driver ${driverId}`);
  return ratingsAtAge(profile, ageIn(fact, season));
}

const bestPace = (team: TeamSeason, season: number): number =>
  Math.max(...team.drivers.slice(0, 2).map((entry) => ratingsIn(entry.id, season).pace), 60);

/**
 * A team's car as it really was that season: as far off the fastest car as its qualifying laps
 * were (less what its drivers account for), and as fragile as its retirements say.
 */
export function realCar(season: number, teamId: string): CarSpec {
  const teams = teamsIn(season);
  const team = teams.find((candidate) => candidate.team === teamId);
  if (!team) throw new RangeError(`${teamId} did not race in ${season}`);
  const pace = REAL_PACE[season] ?? {};

  let quickest = team;
  let starts = 0;
  let failures = 0;
  for (const other of teams) {
    const real = pace[other.team];
    if (!real) continue;
    if (real.gap < (pace[quickest.team]?.gap ?? Infinity)) quickest = other;
    starts += real.starts;
    failures += real.mechanical * real.starts;
  }
  const usual = starts > 0 ? failures / starts : 0.08;
  const real = pace[teamId] ?? { gap: 2.5, mechanical: usual, starts: 0 };

  const driverShare = (bestPace(quickest, season) - bestPace(team, season)) * M.DRIVER_POINT * 100;
  const gap = Math.max(0, real.gap - Math.max(0, driverShare));
  const score = 97 - gap / (M.CAR_POINT * 100);

  // The same engine sits a little above or below the car it is in for every team that uses it.
  const power = between({ rng: seedFrom(team.engineMaker, season, 'power') }, -6, 6);
  const aero = between({ rng: seedFrom(teamId, season, 'aero') }, -6, 6);
  const chassis = -(0.37 * power + 0.37 * aero) / 0.34;
  // One season's retirements are a small sample: lean on the field's average as well.
  const fragile = 0.65 * real.mechanical + 0.35 * usual;

  return {
    aero: clamp(score + aero, 1, 100),
    chassis: clamp(score + chassis, 1, 100),
    power: clamp(score + power, 1, 100),
    reliability: clamp(M.reliabilityFor(fragile), 1, 99),
    pitCrew: clamp(55 + (team.spending / 240) * 40, 40, 97),
  };
}

/** Setup quality when nobody has worked on it: an ordinary weekend. */
export const USUAL_SETUP = 0.8;

/**
 * Who lined up at a round: two cars a team, with the drivers who really raced there. For a round
 * still to be run, the drivers who raced nearest to it.
 *
 * With a seed, every team has its own weekend: some find the setup and some never do. Without,
 * all cars have an ordinary one.
 */
export function realEntrants(season: number, round: number, playerTeam?: string, seed?: number): Entrant[] {
  const held = season !== LAST_SEASON || round <= SOURCES.lastSeasonRoundsHeld;
  const entrants: Entrant[] = [];
  for (const team of teamsIn(season)) {
    const here = team.drivers.filter((entry) => entry.rounds.includes(round));
    if (here.length === 0 && held) continue;
    const nearest = (rounds: readonly number[]): number => Math.min(...rounds.map((other) => Math.abs(other - round)));
    const others = team.drivers
      .filter((entry) => !entry.rounds.includes(round))
      .sort((a, b) => nearest(a.rounds) - nearest(b.rounds));
    const car = realCar(season, team.team);
    const weekend: Luck | null = seed === undefined ? null : { rng: seedFrom(seed, team.team, 'weekend') };
    const found = weekend ? USUAL_SETUP + 0.13 * gaussian(weekend) : USUAL_SETUP;
    [...here, ...others].slice(0, 2).forEach((entry, seat) => {
      const fact = driversById.get(entry.id)!;
      entrants.push({
        id: `${team.team}-${seat + 1}`,
        team: team.team,
        teamName: team.name,
        colour: team.colour,
        driver: fact.id,
        driverName: fact.name,
        code: fact.code,
        ratings: ratingsIn(fact.id, season),
        car,
        setup: clamp(weekend ? found + 0.05 * gaussian(weekend) : found, 0.4, 1),
        engineAge: 0.3,
        player: team.team === playerTeam,
        style: teamStyle(team.team, season),
      });
    });
  }
  return entrants;
}

/** What a session needs to know about a round: the circuit, its character, and the lap to measure by. */
export function roundFacts(season: number, round: number) {
  const fact = calendar(season)[round - 1];
  if (!fact) throw new RangeError(`No round ${round} in ${season}`);
  return { fact, traits: circuitTraits(fact.circuit), finale: round === calendar(season).length };
}

/** A race or a sprint at a real round, for the cars given in grid order. */
export function raceSetup(season: number, round: number, kind: 'race' | 'sprint', grid: readonly Entrant[]): SessionSetup {
  const { fact, traits, finale } = roundFacts(season, round);
  if (kind === 'sprint' && fact.sprintLaps === null) throw new RangeError(`No sprint at round ${round} of ${season}`);
  return {
    kind,
    season,
    round,
    finale,
    name: fact.name,
    circuit: fact.circuit,
    laps: kind === 'sprint' ? fact.sprintLaps! : fact.laps,
    fullDistanceLaps: fact.laps,
    lapKm: fact.lapKm,
    refLap: fact.refLap,
    traits,
    rules: sessionRules(season, kind),
    compounds: compoundsFor(season, traits, fact.laps),
    grid,
  };
}
