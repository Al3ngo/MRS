/**
 * Drivers' contracts and the driver market.
 *
 * A driver's asking salary follows how good he is (his overall rating): about 24 a season for the
 * very best, around 4 for a solid midfielder, under 1 for a beginner. Some drivers bring backers
 * who pay the team; a few of them pay more than they ask. Contracts run one to three seasons.
 *
 * The market opens between seasons. On it are the player's own drivers whose contracts have run
 * out, every driver whose real career moved him to another team that winter, and the rookies of
 * the coming season. A driver who in reality stayed where he was is under contract and not for
 * sale. Who retires is still the real record until the driver lifecycle arrives in Stage 7.
 */
import { DRIVERS, driversBy, teamsIn, type DriverSeason } from '../data';
import { random, seedFrom } from '../sim/rng';
import { money } from './money';
import type { DriverContract } from './types';

/**
 * Drivers who brought backers' money to their teams, with the seasons and the game's estimate of
 * how much a season. The figures are the game's own; the real deals were never published in full.
 */
const BACKED: Readonly<Record<string, readonly [number, number, number]>> = {
  'pastor-maldonado': [2011, 2015, 15],
  'nikita-mazepin': [2021, 2021, 12],
  'lance-stroll': [2017, 2026, 10],
  'vitaly-petrov': [2010, 2012, 6],
  'felipe-nasr': [2015, 2016, 6],
  'sergey-sirotkin': [2018, 2018, 6],
  'nicholas-latifi': [2020, 2022, 6],
  'esteban-gutierrez': [2013, 2016, 5],
  'marcus-ericsson': [2014, 2018, 5],
  'giedo-van-der-garde': [2013, 2013, 5],
  'rio-haryanto': [2016, 2016, 5],
  'guanyu-zhou': [2022, 2024, 5],
  'sergio-perez': [2011, 2026, 4],
  'bruno-senna': [2010, 2012, 4],
  'narain-karthikeyan': [2011, 2012, 4],
  'max-chilton': [2013, 2014, 4],
  'sakon-yamamoto': [2010, 2010, 3],
  'charles-pic': [2012, 2013, 3],
  'karun-chandhok': [2010, 2011, 2],
  'jerome-dambrosio': [2011, 2012, 2],
  'will-stevens': [2014, 2015, 2],
  'roberto-merhi': [2015, 2015, 2],
  'alexander-rossi': [2015, 2015, 2],
  'jolyon-palmer': [2016, 2017, 2],
  'logan-sargeant': [2023, 2024, 2],
};

/** Backers' money a driver brings in a season. */
export function backingFor(driver: string, season: number): number {
  const entry = BACKED[driver];
  return entry && season >= entry[0] && season <= entry[1] ? entry[2] : 0;
}

/** The driver as he stands in a season, if he is in the sport by then. */
export const driverIn = (driver: string, season: number): DriverSeason | undefined =>
  season >= 2010 && season <= 2026 ? driversBy(season).find((entry) => entry.driver.id === driver) : undefined;

/** What a driver asks a season on a contract of `length` seasons. */
export function driverAsk(entry: DriverSeason, length = 1): number {
  let ask = Math.exp(0.127 * (entry.overall - 70));
  if (entry.age <= 22) ask *= 0.75;
  if (entry.age >= 37) ask *= 0.8;
  // Young drivers want to stay free to move up; older ones want security.
  if (entry.age <= 25) ask *= 1 + 0.06 * (length - 1);
  if (entry.age >= 33) ask *= 1 - 0.06 * (length - 1);
  return money(Math.max(0.5, ask));
}

const realTeams = new Map<number, ReadonlyMap<string, string>>();

/** The team a driver really raced for in a season: the one he started most rounds for. */
export function realTeamOf(driver: string, season: number): string | null {
  let map = realTeams.get(season);
  if (!map) {
    const most = new Map<string, number>();
    const built = new Map<string, string>();
    for (const team of season >= 2010 && season <= 2026 ? teamsIn(season) : []) {
      for (const entry of team.drivers) {
        if (entry.rounds.length > (most.get(entry.id) ?? 0)) {
          most.set(entry.id, entry.rounds.length);
          built.set(entry.id, team.team);
        }
      }
    }
    map = built;
    realTeams.set(season, map);
  }
  return map.get(driver) ?? null;
}

/** The last season of a driver's unbroken real stint at a team, from `from` on. */
export function stintEnd(driver: string, team: string, from: number, last: number): number {
  let season = from;
  while (season < last && realTeamOf(driver, season + 1) === team) season++;
  return season;
}

/** Whether a driver really raced in one of the two seasons before this one. */
export const recentlyRaced = (driver: string, season: number): boolean =>
  realTeamOf(driver, season - 1) !== null || realTeamOf(driver, season - 2) !== null;

/** Whether a driver's real career is over by a season: no race start that year or later. */
export function retiredBy(driver: string, season: number): boolean {
  const fact = DRIVERS.find((candidate) => candidate.id === driver);
  return !fact || fact.raced[1] < season;
}

/** Top drivers want a car that can win. Whether a driver will talk to a team at this standing. */
export function willTalk(overall: number, standing: number): boolean {
  if (overall >= 92) return standing <= 5;
  if (overall >= 88) return standing <= 7;
  if (overall >= 84) return standing <= 9;
  return true;
}

export type MarketStatus = 'yours' | 'moving' | 'rookie' | 'returning';

export interface MarketDriver {
  driver: string;
  overall: number;
  age: number;
  /** Asking salary on a one-season contract. */
  ask: number;
  backing: number;
  status: MarketStatus;
}

/**
 * Drivers the player can sign for `season`: his own whose contracts have run out, and every driver
 * not tied to another team for that season. `keep` lists drivers already under contract with the
 * player for that season.
 */
export function marketDrivers(season: number, team: string, keep: readonly string[], expired: readonly string[]): MarketDriver[] {
  const out: MarketDriver[] = [];
  for (const fact of DRIVERS) {
    const id = fact.id;
    if (keep.includes(id)) continue;
    // In the sport that season in reality: racing, or between drives after racing in one of the two
    // seasons before (a year out counts; a long absence, like Kubica's after his injury, does not).
    const next = realTeamOf(id, season);
    const before = realTeamOf(id, season - 1);
    if (next === null && !recentlyRaced(id, season) && fact.debut !== season) continue;
    const mine = expired.includes(id);
    if (!mine && before !== null && before === next && next !== team) continue; // stays where he was
    const entry = driverIn(id, season);
    if (!entry) continue;
    const status: MarketStatus = mine ? 'yours' : entry.rookie ? 'rookie' : before === null ? 'returning' : 'moving';
    out.push({ driver: id, overall: entry.overall, age: entry.age, ask: driverAsk(entry), backing: backingFor(id, season), status });
  }
  return out.sort((a, b) => b.overall - a.overall || a.driver.localeCompare(b.driver));
}

export type OfferResult = 'signed' | 'refused' | 'not-interested';

/**
 * A driver's answer to an offer. At or above his asking salary he signs. A lower offer (no lower
 * than 85% of it) he may take, more readily from a top team; one he turns down, he will not hear
 * again this winter.
 */
export function offerResponse(
  driver: string,
  overall: number,
  standing: number,
  offer: number,
  ask: number,
  refused: readonly string[],
  seed: number,
): OfferResult {
  if (!willTalk(overall, standing)) return 'not-interested';
  if (offer >= ask) return 'signed';
  if (refused.includes(driver) || offer < ask * 0.85 - 1e-9) return 'refused';
  const odds = 0.45 + (standing <= 4 ? 0.15 : 0);
  return random({ rng: seedFrom(seed, driver, 'offer') }) < odds ? 'signed' : 'refused';
}

/** A contract for a driver: salary on the length chosen, and his backers' money. */
export function contractFor(entry: DriverSeason, season: number, length: number, salary = driverAsk(entry, length)): DriverContract {
  return { driver: entry.driver.id, salary: money(salary), backing: backingFor(entry.driver.id, season), until: season + length - 1 };
}

/**
 * The best driver not otherwise racing: who a team the simulation runs puts in a seat the player
 * has taken from it. Drivers racing that season or in one of the two before, 40 or under.
 */
export function bestFreeDriver(season: number, taken: ReadonlySet<string>): DriverSeason | undefined {
  return driversBy(season).find(
    (entry) =>
      !taken.has(entry.driver.id) &&
      entry.age <= 40 &&
      (realTeamOf(entry.driver.id, season) !== null || recentlyRaced(entry.driver.id, season)),
  );
}
