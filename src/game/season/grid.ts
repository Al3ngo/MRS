/**
 * Who races at a round of a career.
 *
 * The teams the simulation runs field the drivers who really raced for them at that round, in a
 * car as quick and as fragile as the real one was that season (a stand-in until the driver
 * lifecycle arrives in Stage 7). The one exception: a driver under contract to the player races
 * for the player, and his real team puts the best free driver in his seat.
 *
 * The player's team races its contracted drivers in its own car: the real car of that season,
 * plus or minus what the team's development has done (see team/development.ts). A team the player
 * runs stays in the sport after its real exit, starting from its last real car.
 */
import { DRIVERS, TEAMS, driver, driversBy, teamColour, teamStyle, teamsIn } from '../data';
import { activeIn, newWorld, type World } from '../world';
import { racePaceOf, realCar, realEntrants, ratingsIn, USUAL_SETUP, weekendForm, withForm } from '../sim/session';
import { seedFrom } from '../sim/rng';
import type { Entrant } from '../sim/types';
import {
  bestFreeDriver,
  engineStrength,
  heldBy,
  pitCrewRating,
  playerCar,
  raceEngineAge,
  realEngineOf,
  strategistSureness,
  worksTeam,
  type Outfit,
} from '../team';

const teamFacts = new Map(TEAMS.map((team) => [team.id, team]));
const driverFacts = new Map(DRIVERS.map((driver) => [driver.id, driver]));

/** The team's last real season, and its name then. */
function lastReal(team: string): { season: number; name: string } {
  const fact = teamFacts.get(team);
  if (!fact) throw new RangeError(`Unknown team ${team}`);
  return { season: fact.seasons[1], name: fact.names[fact.names.length - 1]!.name };
}

/** Whether the team really raced in a season. */
export const realTeamIn = (team: string, season: number): boolean => teamsIn(season).some((entry) => entry.team === team);

/** The real car a team's season starts from: that season's, or after its real exit, its last. */
export const baseCar = (team: string, season: number) =>
  realTeamIn(team, season) ? realCar(season, team) : realCar(lastReal(team).season, team);

/** What a change of engine supplier is worth against the real one: [power, reliability]. */
export function supplierDelta(outfit: Outfit, team: string, season: number): readonly [number, number] {
  if (worksTeam(outfit, team)) return [0, 0];
  const real = realEngineOf(team, season) ?? outfit.engine;
  const [power, reliability] = engineStrength(outfit.engine, season);
  const [realPower, realReliability] = engineStrength(real, season);
  return [power - realPower, reliability - realReliability];
}

/**
 * The cars of a career round. `setups` gives the setup quality of the player's cars from practice;
 * cars it does not name keep the setup their team found this weekend.
 */
export function roundEntrants(
  careerId: string,
  season: number,
  round: number,
  team: string,
  setups: Readonly<Record<string, number>> = {},
  outfit: Outfit | null = null,
  world: World = newWorld(),
): Entrant[] {
  const seed = seedFrom(careerId, season, round, 'weekend');
  const entrants = realEntrants(season, round, team, seed);
  if (!outfit) {
    if (!entrants.some((entrant) => entrant.team === team)) entrants.push(...survivor(season, round, team, entrants));
    return entrants.map((entrant) => (setups[entrant.id] !== undefined ? { ...entrant, setup: setups[entrant.id]! } : entrant));
  }

  // The player's cars: contracted drivers, the team's own car.
  const real = entrants.filter((entrant) => entrant.team === team);
  const last = lastReal(team);
  const named = realTeamIn(team, season) ? real[0] : undefined;
  const car = withForm(
    playerCar(baseCar(team, season), outfit.parts, season, supplierDelta(outfit, team, season), pitCrewRating(outfit)),
    weekendForm(team, seed),
  );
  const weekend = seedFrom(team, season, round, 'survivor');
  const mine: Entrant[] = outfit.drivers.slice(0, 2).map((contract, seat) => {
    const id = `${team}-${seat + 1}`;
    const fact = driver(contract.driver);
    return {
      id,
      team,
      teamName: named?.teamName ?? last.name,
      colour: named?.colour ?? teamColour(team, Math.min(season, last.season)),
      driver: contract.driver,
      driverName: fact.name,
      code: fact.code,
      ratings: withBonus(ratingsIn(contract.driver, season), outfit.academyBonus?.[contract.driver] ?? 0),
      car,
      setup: setups[id] ?? real[seat]?.setup ?? USUAL_SETUP + ((weekend >>> (seat * 4)) & 15) / 200,
      engineAge: outfit.units[seat] ? raceEngineAge(outfit.units[seat]!, season) : 0.3,
      player: true,
      style: teamStyle(team, Math.min(season, last.season)),
      strategist: strategistSureness(outfit),
      racePace: racePaceOf(seed, team, seat),
    };
  });

  // The others: a driver the player holds (under contract, or in the academy), or one lost or
  // retired, is replaced by the best free driver.
  const others = entrants.filter((entrant) => entrant.team !== team);
  const held = heldBy(outfit, season);
  const away = (id: string): boolean => held.has(id) || !activeIn(world, id, season, held);
  const taken = new Set([...others.filter((entrant) => !away(entrant.driver)).map((entrant) => entrant.driver), ...mine.map((entrant) => entrant.driver)]);
  const filled = others.map((entrant) => {
    if (!away(entrant.driver)) return entrant;
    const free = bestFreeDriver(season, taken, world, held);
    if (!free) return entrant;
    taken.add(free.driver.id);
    return { ...entrant, driver: free.driver.id, driverName: free.driver.name, code: free.driver.code, ratings: free.ratings };
  });
  return [...filled, ...mine];
}

/** Ratings with the academy's years added, none past 99. */
const withBonus = (ratings: Entrant['ratings'], bonus: number): Entrant['ratings'] =>
  bonus <= 0
    ? ratings
    : {
        pace: Math.min(99, ratings.pace + bonus),
        racecraft: Math.min(99, ratings.racecraft + bonus),
        consistency: Math.min(99, ratings.consistency + bonus),
        tyres: Math.min(99, ratings.tyres + bonus),
        wet: Math.min(99, ratings.wet + bonus),
        aggression: ratings.aggression,
      };

/**
 * The player's team after its real exit, before Stage 6 (careers without a team business): its
 * last real car, and its last real drivers where they are free; a seat a driver has left goes to
 * the best free driver.
 */
function survivor(season: number, round: number, team: string, others: readonly Entrant[]): Entrant[] {
  const last = lastReal(team);
  const final = teamsIn(last.season).find((entry) => entry.team === team)!;
  const taken = new Set(others.map((entrant) => entrant.driver));
  const lastRound = Math.max(...final.drivers.flatMap((entry) => entry.rounds));
  const kept = final.drivers
    .filter((entry) => entry.rounds.includes(lastRound) && !taken.has(entry.id))
    .map((entry) => entry.id);
  const free = driversBy(season)
    .filter((entry) => !taken.has(entry.driver.id) && !kept.includes(entry.driver.id))
    .filter((entry) => entry.age <= 40 && entry.driver.raced[1] >= season - 3)
    .map((entry) => entry.driver.id);
  const drivers = [...kept, ...free].slice(0, 2);
  const car = realCar(last.season, team);
  const weekend = seedFrom(team, season, round, 'survivor');
  return drivers.map((id, seat) => {
    const fact = driverFacts.get(id)!;
    const ratings = driversBy(season).find((entry) => entry.driver.id === id)!.ratings;
    return {
      id: `${team}-${seat + 1}`,
      team,
      teamName: last.name,
      colour: teamColour(team, Math.min(season, last.season)),
      driver: id,
      driverName: fact.name,
      code: fact.code,
      ratings,
      car,
      setup: 0.75 + ((weekend >>> (seat * 4)) & 15) / 100,
      engineAge: 0.3,
      player: true,
      style: teamStyle(team, Math.min(season, last.season)),
    };
  });
}
