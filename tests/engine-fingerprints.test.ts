/**
 * The race engine's results, pinned. A fixed set of qualifying sessions and races across every era,
 * with every team's pit wall at its balanced style, must come out exactly as recorded: same times,
 * same events, same final state, to the last decimal. Anything that changes a result fails here.
 *
 * After a deliberate change to the engine, record the new results with:
 *   npx vitest run tests/engine-fingerprints.test.ts -u
 */
import { describe, expect, it } from 'vitest';
import { calendar } from '../src/game/data';
import {
  classification,
  createRace,
  gridOrder,
  qualifyingFor,
  raceSetup,
  realEntrants,
  runPart,
  runToEnd,
  seedFrom,
} from '../src/game/sim';

const SEASONS = [2010, 2011, 2012, 2014, 2016, 2017, 2019, 2021, 2022, 2024, 2025, 2026];

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fingerprint(season: number, round: number, run: number): Promise<string> {
  const seed = seedFrom('fp', season, round, run);
  const entrants = realEntrants(season, round, run === 2 ? 'ferrari' : undefined, seed).map((entrant) => ({
    ...entrant,
    style: 'balanced' as const,
  }));
  const qualifying = qualifyingFor(season, round, entrants, seed);
  while (qualifying.part !== 4) runPart(qualifying);
  const byId = new Map(entrants.map((entrant) => [entrant.id, entrant]));
  const race = createRace(raceSetup(season, round, 'race', gridOrder(qualifying).map((id) => byId.get(id)!)), seedFrom(seed, 'race'));
  for (const car of race.cars) car.auto = true;
  runToEnd(race);
  const hash = await sha256(
    JSON.stringify(qualifying.parts) +
      JSON.stringify(classification(race)) +
      JSON.stringify(race.events) +
      JSON.stringify(race.cars.map((car) => [car.pos, car.wear, car.fuel, car.stress, car.battery])),
  );
  return hash.slice(0, 16);
}

describe('the race engine', () => {
  it('gives exactly the recorded results', async () => {
    const now: Record<string, string> = {};
    for (const season of SEASONS) {
      for (const round of calendar(season).filter((_, index) => index % 8 === 0)) {
        for (const run of [1, 2]) now[`${season} ${round.round} ${run}`] = await fingerprint(season, round.round, run);
      }
    }
    expect(Object.keys(now).length).toBeGreaterThan(40);
    await expect(`${JSON.stringify(now, null, 2)}\n`).toMatchFileSnapshot('./fixtures/engine-fingerprints.json');
  }, 120_000);
});
