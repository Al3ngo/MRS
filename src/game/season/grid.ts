/**
 * Who races at a round of a career.
 *
 * STAGE 5 STAND-IN. Until contracts (Stage 6) and the driver lifecycle (Stage 7) exist, every team
 * fields the drivers who really raced for it at that round, and its car is as quick and as fragile
 * as the real one was that season. The player's team is no exception, except in one way: a team
 * the player runs stays in the sport after its real exit, keeping its last car and its drivers.
 */
import { DRIVERS, TEAMS, driversBy, teamColour, teamStyle, teamsIn } from '../data';
import { realCar, realEntrants } from '../sim/session';
import { seedFrom } from '../sim/rng';
import type { Entrant } from '../sim/types';

const teamFacts = new Map(TEAMS.map((team) => [team.id, team]));
const driverFacts = new Map(DRIVERS.map((driver) => [driver.id, driver]));

/** The team's last real season, and its name then. */
function lastReal(team: string): { season: number; name: string } {
  const fact = teamFacts.get(team);
  if (!fact) throw new RangeError(`Unknown team ${team}`);
  return { season: fact.seasons[1], name: fact.names[fact.names.length - 1]!.name };
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
): Entrant[] {
  const seed = seedFrom(careerId, season, round, 'weekend');
  const entrants = realEntrants(season, round, team, seed);
  if (!entrants.some((entrant) => entrant.team === team)) entrants.push(...survivor(season, round, team, entrants));
  return entrants.map((entrant) =>
    setups[entrant.id] !== undefined ? { ...entrant, setup: setups[entrant.id]! } : entrant,
  );
}

/**
 * The player's team after its real exit: its last real car, and its last real drivers where they
 * are free; a seat a driver has left (for another team, in reality) goes to the best free driver.
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

/** Whether the team really raced in a season. */
export const realTeamIn = (team: string, season: number): boolean => teamsIn(season).some((entry) => entry.team === team);
