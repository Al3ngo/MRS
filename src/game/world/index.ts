/**
 * The drivers' world over a career: who is still racing, who has retired, who has been lost, and
 * the made-up drivers who join as the years go by. Stage 7 of the brief: ageing, retirement,
 * fatalities, fictional generation.
 *
 *   Ageing       ratings follow a driver's age (see data/ratings.ts), real and made-up alike.
 *   Retirement   a real driver retires when he really did, except that one under contract to the
 *                player sees his contract out first; a made-up driver stops at their own age.
 *   Fatalities   rare. Rolled after a race for each car that crashed out, more likely before the
 *                halo (2018), at circuits with walls close by, and for an aggressive driver. The
 *                race itself is never changed: its results stand.
 *   Generation   each season a few young prospects appear, and whenever the free drivers run thin
 *                (real ones lost, retired or signed away), race-ready made-up drivers join.
 *
 * Plain data and pure functions; the career keeps a World and passes it in.
 */
import { DRIVERS, ageIn, careerTag, driver, driversBy, fictionalDriver, isFictional, overall, profileOf, ratingsAtAge, teamsIn, type DriverSeason } from '../data';
import { classification } from '../sim/race';
import { random, seedFrom } from '../sim/rng';
import type { RaceState } from '../sim/types';

/** A driver lost in a fatal accident. */
export interface LostDriver {
  driver: string;
  team: string;
  season: number;
  round: number;
  /** The race's name: "Belgian Grand Prix". */
  race: string;
  lap: number;
}

export interface World {
  lost: LostDriver[];
  /** Every made-up driver of the career, in the order they appeared. */
  fictional: string[];
  /** Whether fatal accidents can happen (the brief's suggested sandbox setting). On by default. */
  fatalAccidents: boolean;
}

export const newWorld = (fatalAccidents = true): World => ({ lost: [], fictional: [], fatalAccidents });

export const isLost = (world: World, id: string): boolean => world.lost.some((entry) => entry.driver === id);

// ── The record ──────────────────────────────────────────────────────────────────────────────

const realTeams = new Map<number, ReadonlyMap<string, string>>();

/** The team a driver really raced for in a season: the one he started most rounds for. */
export function realTeamOf(id: string, season: number): string | null {
  if (season < 2010 || season > 2026) return null;
  let map = realTeams.get(season);
  if (!map) {
    const most = new Map<string, number>();
    const built = new Map<string, string>();
    for (const team of teamsIn(season)) {
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
  return map.get(id) ?? null;
}

/** Whether a driver really raced in one of the two seasons before this one. */
export const recentlyRaced = (id: string, season: number): boolean =>
  realTeamOf(id, season - 1) !== null || realTeamOf(id, season - 2) !== null;

// ── Who is in the sport ─────────────────────────────────────────────────────────────────────

/** The youngest a driver may race at: 17, and 18 from 2016 (the rule after Verstappen's debut). */
export const raceAge = (season: number): number => (season < 2016 ? 17 : 18);

/** Whether a driver's own career is over by a season: a real one's when he really stopped, a made-up one's at their own age. */
export function careerOver(id: string, season: number): boolean {
  if (isFictional(id)) {
    const made = fictionalDriver(id);
    return ageIn(made.fact, season) > made.retireAge;
  }
  const fact = DRIVERS.find((candidate) => candidate.id === id);
  return !fact || fact.raced[1] < season;
}

/**
 * Whether a driver is in the sport in a season: arrived, not lost, and either still going or held
 * by the player (under contract or in the academy), who keeps a driver until the deal runs out.
 */
export function activeIn(world: World, id: string, season: number, held: ReadonlySet<string>): boolean {
  if (isLost(world, id)) return false;
  const fact = driver(id);
  if (fact.debut > season && !held.has(id)) return false;
  return held.has(id) || !careerOver(id, season);
}

/** A driver as they stand in a season, real or made up. */
export function standing(id: string, season: number): DriverSeason | undefined {
  if (!isFictional(id) && season >= 2010 && season <= 2026) {
    const found = driversBy(season).find((entry) => entry.driver.id === id);
    if (found) return found;
  }
  // A made-up driver, or a real one before his debut (an academy junior): rated at their age.
  const profile = profileOf(id);
  if (!profile) return undefined;
  const fact = driver(id);
  const age = ageIn(fact, season);
  const ratings = ratingsAtAge(profile, age);
  return { driver: fact, age, ratings, overall: overall(ratings), rookie: fact.debut === season };
}

export const raceReady = (id: string, season: number): boolean => ageIn(driver(id), season) >= raceAge(season);

/**
 * Drivers free to take a seat in a season, best first: real drivers whose careers go on (racing
 * that season in reality, or recently), and race-ready made-up drivers; none lost, none `taken`
 * (already in a seat), none held by the player.
 */
export function freePool(world: World, season: number, taken: ReadonlySet<string>, held: ReadonlySet<string>): DriverSeason[] {
  const pool: DriverSeason[] = [];
  const consider = (id: string): void => {
    if (taken.has(id) || held.has(id) || !activeIn(world, id, season, held) || !raceReady(id, season)) return;
    if (!isFictional(id) && realTeamOf(id, season) === null && !recentlyRaced(id, season)) return;
    const entry = standing(id, season);
    if (entry && entry.age <= 40) pool.push(entry);
  };
  for (const entry of driversBy(season)) consider(entry.driver.id);
  for (const id of world.fictional) consider(id);
  return pool.sort((a, b) => b.overall - a.overall || a.driver.id.localeCompare(b.driver.id));
}

/** Where a driver is in their career, for the screens. */
export type CareerStage = 'improving' | 'peak' | 'fading' | 'final';

export function careerStage(id: string, season: number, held: ReadonlySet<string> = new Set()): CareerStage {
  const fact = driver(id);
  const age = ageIn(fact, season);
  if (!held.has(id) && careerOver(id, season + 1)) return 'final';
  const [from, to] = profileOf(id)?.prime ?? [25, 32];
  if (age < from) return 'improving';
  return age <= to ? 'peak' : 'fading';
}

// ── Fatal accidents ─────────────────────────────────────────────────────────────────────────

/**
 * Chance that a crash out of a race is fatal, before the circuit and the driver: tuned so that a
 * career sees about one, mostly in the years before the halo, as the real sport saw one (Jules
 * Bianchi, 2014) in these seasons.
 */
const FATAL_BASE = 0.00105;

export function fatalChance(season: number, danger: number, aggression: number): number {
  const era = season < 2018 ? 2.5 : 1;
  const track = 0.4 + 0.3 * danger;
  const driving = 0.6 + (0.8 * aggression) / 100;
  return FATAL_BASE * era * track * driving;
}

/** Who, if anyone, did not survive a crash in this race. Rolled with the career's own luck, never the race's. */
export function fatalities(world: World, careerId: string, race: RaceState): LostDriver[] {
  if (!world.fatalAccidents) return [];
  const { setup } = race;
  const lost: LostDriver[] = [];
  for (const row of classification(race)) {
    if (row.status !== 'Accident' && row.status !== 'Collision') continue;
    const entrant = setup.grid.find((candidate) => candidate.driver === row.driver);
    if (!entrant) continue;
    const roll = random({ rng: seedFrom(careerId, setup.season, setup.round, setup.kind, row.driver, 'fatal') });
    if (roll < fatalChance(setup.season, setup.traits.danger, entrant.ratings.aggression)) {
      lost.push({ driver: row.driver, team: row.team, season: setup.season, round: setup.round, race: setup.name, lap: row.laps + 1 });
    }
  }
  return lost;
}

// ── New drivers ─────────────────────────────────────────────────────────────────────────────

/** Free drivers good enough for a seat that the field should always have to call on. */
const RESERVE = 6;
const RESERVE_QUALITY = 72;
/** Young prospects who appear each season. */
const PROSPECTS = 3;

/** Every driver in a real seat in a season, taken for the free pool's sake. */
export const realSeats = (season: number): Set<string> =>
  new Set(teamsIn(season).flatMap((team) => team.drivers.map((entry) => entry.id)));

/**
 * The turn of a season: this year's prospects arrive, and if the free drivers have run thin,
 * race-ready made-up drivers join until there are enough to fill a seat.
 */
export function newcomers(world: World, careerId: string, season: number, held: ReadonlySet<string>): World {
  const tag = careerTag(careerId);
  const fictional = [...world.fictional];
  for (let index = 1; index <= PROSPECTS; index++) {
    const id = `fx-${season}-p${index}-${tag}`;
    if (!fictional.includes(id)) fictional.push(id);
  }
  let next: World = { ...world, fictional };
  const seats = realSeats(season);
  const enough = (): boolean =>
    freePool(next, season, seats, held).filter((entry) => entry.overall >= RESERVE_QUALITY).length >= RESERVE;
  for (let index = 1; index <= 20 && !enough(); index++) {
    const id = `fx-${season}-r${index}-${tag}`;
    if (!next.fictional.includes(id)) next = { ...next, fictional: [...next.fictional, id] };
  }
  return next;
}

/** After a loss in the season: a race-ready made-up driver joins if the free drivers have run out. */
export function afterLoss(world: World, careerId: string, season: number, round: number, held: ReadonlySet<string>): World {
  const seats = realSeats(season);
  if (freePool(world, season, seats, held).length >= 2) return world;
  const id = `fx-${season}-r${50 + round}-${careerTag(careerId)}`;
  return world.fictional.includes(id) ? world : { ...world, fictional: [...world.fictional, id] };
}

/** Young drivers a team can sign to its academy: made-up prospects, and real drivers before their debut. */
export function prospects(world: World, season: number, held: ReadonlySet<string>): DriverSeason[] {
  const out: DriverSeason[] = [];
  const consider = (id: string): void => {
    if (held.has(id) || isLost(world, id)) return;
    const entry = standing(id, season);
    if (!entry || entry.age < 15 || entry.age > 19) return;
    if (!isFictional(id) && entry.driver.debut <= season) return;
    out.push(entry);
  };
  for (const fact of DRIVERS) if (fact.debut > season) consider(fact.id);
  for (const id of world.fictional) if (fictionalDriver(id).kind === 'prospect') consider(id);
  return out.sort((a, b) => potentialOf(b.driver.id) - potentialOf(a.driver.id) || a.driver.id.localeCompare(b.driver.id));
}

/** How good a driver will be at their best: their peak's overall rating. */
export const potentialOf = (id: string): number => {
  const profile = profileOf(id);
  return profile ? overall(profile.peak) : 0;
};
