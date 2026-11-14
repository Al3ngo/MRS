import { describe, expect, it } from 'vitest';
import { ROUNDS } from '../src/game/data/generated/rounds';
import { fastestLapPointOffered, knockoutCuts, racePointsTable, rulesFor } from '../src/game/data/regulations';
import real from './fixtures/real-results.json';

interface RealRace {
  round: number;
  gp: string;
  laps: number;
  scheduled: number;
  fastest: string | null;
  /** [finishing position, driver id, points actually awarded] */
  race: [number, string, number][];
  sprint: [number, string, number][];
}
const history = real as unknown as Record<string, RealRace[]>;

/** Stopped races that were restarted and ran to the flag, which the 2022 wording paid in full. */
const RESUMED = new Set(['2022 japan']);
/**
 * Laps the leader actually ran, where the record shows fewer. At Spa in 2021 three laps were run
 * behind the safety car, which was enough for half points, but the result was taken from lap one.
 */
const LAPS_RUN: Record<string, number> = { '2021 belgium': 3 };

describe('points rules against the real results of every race, 2010 to 2026', () => {
  for (const [year, races] of Object.entries(history)) {
    it(`${year}: ${races.length} races`, () => {
      const season = Number(year);
      const rules = rulesFor(season);
      const lastRound = ROUNDS[season]!.length;
      for (const race of races) {
        const outcome = {
          lapsCompleted: LAPS_RUN[`${year} ${race.gp}`] ?? race.laps,
          lapsScheduled: race.scheduled,
          finale: race.round === lastRound,
          resumed: RESUMED.has(`${year} ${race.gp}`),
        };
        const table = racePointsTable(rules, outcome);
        const bonus = fastestLapPointOffered(rules, outcome);
        for (const [position, driver, awarded] of race.race) {
          const fastestLap = bonus && driver === race.fastest && position <= 10 ? 1 : 0;
          expect((table[position - 1] ?? 0) + fastestLap, `${year} ${race.gp}: P${position} ${driver}`).toBe(awarded);
        }
        for (const [position, driver, awarded] of race.sprint) {
          expect(rules.sprintPoints[position - 1] ?? 0, `${year} ${race.gp} sprint: P${position} ${driver}`).toBe(awarded);
        }
      }
    });
  }
});

describe('knockout qualifying', () => {
  it('leaves ten cars for the last part', () => {
    expect(knockoutCuts(24)).toEqual([7, 7]);
    expect(knockoutCuts(22)).toEqual([6, 6]);
    expect(knockoutCuts(20)).toEqual([5, 5]);
    expect(knockoutCuts(10)).toEqual([0, 0]);
  });
});
