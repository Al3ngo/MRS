/**
 * The simulation: practice, qualifying and the race. Pure functions over plain data; nothing here
 * touches the screen, storage or the clock.
 */
import { createQualifying, gridOrder, runPart, type QualifyingState } from './qualifying';
import { createRace } from './race';
import { seedFrom } from './rng';
import { raceSetup, realEntrants, roundFacts, sessionRules } from './session';
import type { Entrant, RaceState } from './types';

export * from './model';
export * from './practice';
export * from './qualifying';
export * from './race';
export * from './readouts';
export * from './rng';
export * from './styles';
export * from './session';
export { lapsToGo, options, planRace, TIME_LIMIT } from './strategy';
export * from './tyres';
export * from './weather';
export type * from './types';

/** Qualifying at a real round for the cars given. */
export function qualifyingFor(season: number, round: number, entrants: readonly Entrant[], seed: number): QualifyingState {
  const { fact, traits } = roundFacts(season, round);
  return createQualifying(
    {
      season,
      round,
      name: fact.name,
      circuit: fact.circuit,
      refLap: fact.refLap,
      traits,
      rules: sessionRules(season, 'race'),
      entrants,
    },
    seedFrom(seed, 'qualifying'),
  );
}

/**
 * A whole real round in one call: the cars and drivers who were there, qualifying run, and the
 * race ready on the grid. What a quick race starts from.
 */
export function quickRace(
  season: number,
  round: number,
  seed: number,
  playerTeam?: string,
): { qualifying: QualifyingState; race: RaceState } {
  const entrants = realEntrants(season, round, playerTeam, seed);
  const qualifying = qualifyingFor(season, round, entrants, seed);
  while (qualifying.part !== 4) runPart(qualifying);
  const byId = new Map(entrants.map((entrant) => [entrant.id, entrant]));
  const grid = gridOrder(qualifying).map((id) => byId.get(id)!);
  return { qualifying, race: createRace(raceSetup(season, round, 'race', grid), seedFrom(seed, 'race')) };
}
