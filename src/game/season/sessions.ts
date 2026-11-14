/**
 * The sessions of a career weekend, built from the career and run through the race engine.
 * Every session's luck comes from the career's id and the round, so a weekend replayed from the
 * same save goes the same way.
 */
import {
  finishManagement,
  finishPractice,
  finishRace,
  saveQualifying,
  type CareerState,
  type PracticeState,
} from '../career';
import { circuitTraits, calendar } from '../data';
import {
  DIALS,
  feedbackPrecision,
  idealSetup,
  setupFeedback,
  setupQuality,
  type CarSetup,
} from '../sim/practice';
import { gridOrder, runPart, type QualifyingState } from '../sim/qualifying';
import { classification, command, createRace, runToEnd } from '../sim/race';
import { clamp, gaussian, seedFrom } from '../sim/rng';
import { raceSetup } from '../sim/session';
import type { Entrant, RaceState } from '../sim/types';
import { qualifyingFor } from '../sim';
import { roundEntrants } from './grid';
import type { Finish } from './standings';
import { gridSource } from './weekend';

/** Runs each of the player's cars may make in practice. */
export const PRACTICE_RUNS = 4;

const seedOf = (career: CareerState, ...parts: (string | number)[]): number =>
  seedFrom(career.id, career.seasonYear, career.round, ...parts);

/** The cars of this round, the player's with the setups found in practice. */
export function entrantsFor(career: CareerState): Entrant[] {
  if (!career.team) throw new Error('The career has no team yet');
  return roundEntrants(career.id, career.seasonYear, career.round, career.team, career.weekend.setups);
}

export const playerCars = (career: CareerState): Entrant[] => entrantsFor(career).filter((entrant) => entrant.player);

const traitsOf = (career: CareerState) => circuitTraits(calendar(career.seasonYear)[career.round - 1]!.circuit);

/** The best setup for a car this weekend. Hidden from the player; practice finds the way to it. */
const idealFor = (career: CareerState, entrant: Entrant): CarSetup =>
  idealSetup(seedOf(career, 'setup'), traitsOf(career), entrant.driver);

const toStep = (value: number): number => clamp(Math.round(value / 5) * 5, 0, 100);

/** Practice as it starts: the engineers' baseline on each car, no runs made. */
export function startPractice(career: CareerState): PracticeState {
  const practice: PracticeState = { dials: {}, runs: {}, hints: {} };
  for (const entrant of playerCars(career)) {
    const ideal = idealFor(career, entrant);
    const luck = { rng: seedOf(career, entrant.id, 'baseline') };
    practice.dials[entrant.id] = {
      wing: toStep(ideal.wing + gaussian(luck) * 14),
      balance: toStep(ideal.balance + gaussian(luck) * 14),
      ride: toStep(ideal.ride + gaussian(luck) * 14),
    };
    practice.runs[entrant.id] = 0;
    practice.hints[entrant.id] = null;
  }
  return practice;
}

/** A run in practice: the driver's verdict on each dial as the car is set now. */
export function practiceRun(career: CareerState, practice: PracticeState, carId: string): PracticeState {
  const entrant = playerCars(career).find((candidate) => candidate.id === carId);
  const runs = practice.runs[carId] ?? 0;
  if (!entrant || runs >= PRACTICE_RUNS) return practice;
  const luck = { rng: seedOf(career, carId, 'run', runs) };
  const hints = setupFeedback(luck, practice.dials[carId]!, idealFor(career, entrant), feedbackPrecision(entrant.ratings.consistency));
  return { ...practice, runs: { ...practice.runs, [carId]: runs + 1 }, hints: { ...practice.hints, [carId]: hints } };
}

export function setDial(practice: PracticeState, carId: string, dial: (typeof DIALS)[number], value: number): PracticeState {
  const dials = { ...practice.dials[carId]!, [dial]: toStep(value) };
  return { ...practice, dials: { ...practice.dials, [carId]: dials } };
}

/** How good each of the player's setups is, from the dials as they stand. */
export function practiceSetups(career: CareerState, practice: PracticeState): Record<string, number> {
  const setups: Record<string, number> = {};
  for (const entrant of playerCars(career)) {
    setups[entrant.id] = setupQuality(practice.dials[entrant.id]!, idealFor(career, entrant));
  }
  return setups;
}

/** A qualifying session (or sprint qualifying) ready to run. */
export function startQualifying(career: CareerState): QualifyingState {
  return qualifyingFor(career.seasonYear, career.round, entrantsFor(career), seedOf(career, career.phase));
}

/** The grid of a race or sprint, pole first, from the session that sets it. */
export function gridFor(career: CareerState, kind: 'sprint' | 'race'): Entrant[] {
  const entrants = entrantsFor(career);
  const byId = new Map(entrants.map((entrant) => [entrant.id, entrant]));
  const source = gridSource(career.seasonYear, career.round, kind);
  if (source === 'sprint') {
    const byDriver = new Map(entrants.map((entrant) => [entrant.driver, entrant]));
    const order = (career.weekend.sprint ?? []).map((finish) => byDriver.get(finish.driver)).filter((entry) => entry !== undefined);
    return [...order, ...entrants.filter((entrant) => !order.includes(entrant))];
  }
  const session = source === 'qualifying' ? career.weekend.qualifying : career.weekend.sprintQualifying;
  if (!session || session.part !== 4) throw new Error(`The ${source} session has not been run`);
  return gridOrder(session).map((id) => byId.get(id)!).filter(Boolean);
}

/** A race or sprint on its grid, ready for the lights. */
export function startRace(career: CareerState): RaceState {
  if (career.phase !== 'race' && career.phase !== 'sprint') throw new Error('No race is next');
  const kind = career.phase;
  return createRace(raceSetup(career.seasonYear, career.round, kind, gridFor(career, kind)), seedOf(career, kind));
}

/** The pole-sitter of the Grand Prix: the driver at the front of its grid. */
export const poleFor = (career: CareerState): string | null => gridFor(career, 'race')[0]?.driver ?? null;

/** A finished race as the career keeps it. */
export function finishesOf(race: RaceState): Finish[] {
  return classification(race).map((row) => ({
    driver: row.driver,
    team: row.team,
    position: row.position,
    points: row.points,
    classified: row.classified,
    status: row.status,
    grid: row.grid,
    fastestLap: row.fastestLap,
  }));
}

/** Runs the rest of a race at once, the pit wall making every car's calls. */
export function simulateRest(race: RaceState): void {
  for (const car of race.cars) command(race, { type: 'auto', car: car.id, on: true });
  runToEnd(race);
}

/**
 * Plays the next session with no choices made: practice on the engineers' baseline, qualifying at
 * normal effort, a race run by the pit wall, a management phase with nothing to manage. For tests,
 * and for a player who wants to skip ahead.
 */
export function autoplay(career: CareerState): CareerState {
  switch (career.phase) {
    case 'practice': {
      const practice = career.weekend.practice ?? startPractice(career);
      return finishPractice(career, practiceSetups(career, practice));
    }
    case 'qualifying':
    case 'sprint-qualifying': {
      const session = (career.phase === 'qualifying' ? career.weekend.qualifying : career.weekend.sprintQualifying) ?? startQualifying(career);
      while (session.part !== 4) runPart(session);
      return saveQualifying(career, session);
    }
    case 'sprint':
    case 'race': {
      const race = career.weekend.live ?? startRace(career);
      simulateRest(race);
      return finishRace(career, finishesOf(race), career.phase === 'race' ? poleFor(career) : null);
    }
    case 'management':
      return finishManagement(career);
  }
}
