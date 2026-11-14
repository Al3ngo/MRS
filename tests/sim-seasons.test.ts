/**
 * Every real round from 2010 to 2026, simulated once: 352 races.
 *
 * Two jobs. First, nothing breaks: every race reaches a flag and produces a sound classification.
 * Second, the races look like their era: Bridgestone one-stoppers in 2010, two and three stops on
 * the early Pirellis, trains in 2017, and so on. The bands are wide; they are there to catch a
 * change that knocks the balance over, not to hold it to a decimal.
 */
import { describe, expect, it } from 'vitest';
import { REAL_PACE, SEASONS, calendar } from '../src/game/data';
import { TIME_LIMIT, classification, quickRace, runToEnd, type RaceState, type ResultRow } from '../src/game/sim';

interface Run {
  season: number;
  round: number;
  state: RaceState;
  rows: ResultRow[];
}

const runs: Run[] = [];
for (const season of SEASONS) {
  for (const round of calendar(season)) {
    const { race } = quickRace(season, round.round, season * 100 + round.round);
    runToEnd(race);
    runs.push({ season, round: round.round, state: race, rows: classification(race) });
  }
}

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
const inSeasons = (from: number, to: number): Run[] => runs.filter((run) => run.season >= from && run.season <= to);
const dry = (list: Run[]): Run[] => list.filter((run) => !run.state.declaredWet);

/** Stops made by each car that reached the flag. */
const stops = (list: Run[]): number =>
  mean(list.flatMap((run) => run.rows.filter((row) => row.status === 'Finished' || row.status.startsWith('+')).map((row) => row.stops)));

/** Passes fought for after the first lap, per race: what the record counts as overtakes. */
const overtakes = (list: Run[]): number =>
  mean(list.map((run) => run.state.events.filter((event) => event.type === 'overtake' && !event.error && event.lap > 1).length));

describe('every round of every season', () => {
  it('runs to a flag with a sound classification', () => {
    expect(runs.length).toBe(352);
    for (const { season, round, state, rows } of runs) {
      const where = `${season} round ${round}`;
      const cars = state.setup.grid.length;
      expect(state.phase, where).toBe('finished');
      expect(rows.length, where).toBe(cars);
      expect(new Set(rows.map((row) => row.car)).size, where).toBe(cars);
      expect(rows[0]!.laps, where).toBeLessThanOrEqual(state.setup.laps);
      if (!state.endedEarly) expect(rows[0]!.laps, where).toBe(state.setup.laps);
      expect(state.time, where).toBeLessThan(TIME_LIMIT + state.setup.refLap * 4);
      for (const car of state.cars) {
        for (const value of [car.pos, car.fuel, car.wear, car.battery, car.damage, car.engineWear]) {
          expect(Number.isFinite(value), `${where} ${car.id}`).toBe(true);
        }
        expect(car.fuel, `${where} ${car.id} fuel`).toBeGreaterThanOrEqual(0);
        expect(car.battery, `${where} ${car.id} battery`).toBeLessThanOrEqual(100);
        expect(car.status === 'finished' || car.status === 'out', `${where} ${car.id} status`).toBe(true);
      }
      const total = rows.reduce((sum, row) => sum + row.points, 0);
      expect(total, where).toBeLessThanOrEqual(state.setup.finale && season === 2014 ? 202 : 102);
    }
  });

  it('never leaves a car the simulation runs out of fuel or disqualified', () => {
    for (const { season, round, rows } of runs) {
      for (const row of rows) {
        expect(row.status, `${season} round ${round} ${row.car}`).not.toBe('Out of fuel');
        expect(row.status, `${season} round ${round} ${row.car}`).not.toBe('Disqualified');
      }
    }
  });

  it('keeps lap times and race lengths close to the real thing', () => {
    for (const { season, round, state } of dry(runs)) {
      const where = `${season} round ${round}`;
      if (!state.fastestLap) continue;
      const quickest = state.fastestLap.lapTime / state.setup.refLap;
      expect(quickest, where).toBeGreaterThan(1.015);
      expect(quickest, where).toBeLessThan(1.085);
    }
    // Most dry races run between an hour and a quarter and an hour and three quarters.
    const lengths = dry(runs).filter((run) => !run.state.endedEarly).map((run) => run.state.time / 60);
    expect(mean(lengths)).toBeGreaterThan(84);
    expect(mean(lengths)).toBeLessThan(102);
  });
});

describe('the eras', () => {
  it('make the number of pit stops their tyres did', () => {
    const bands: [from: number, to: number, low: number, high: number][] = [
      [2010, 2010, 0.9, 1.4],
      [2011, 2013, 2.0, 3.0],
      [2014, 2016, 1.6, 2.6],
      [2017, 2018, 1.0, 1.7],
      [2019, 2021, 1.1, 1.9],
      [2022, 2026, 1.2, 2.0],
    ];
    for (const [from, to, low, high] of bands) {
      const made = stops(dry(inSeasons(from, to)));
      expect(made, `${from} to ${to}`).toBeGreaterThan(low);
      expect(made, `${from} to ${to}`).toBeLessThan(high);
    }
  });

  it('have the overtaking their cars allowed: little in 2010 and 2017, a great deal from 2011 to 2013', () => {
    const first = overtakes(dry(inSeasons(2010, 2010)));
    const early = overtakes(dry(inSeasons(2011, 2013)));
    const wide = overtakes(dry(inSeasons(2017, 2018)));
    const ground = overtakes(dry(inSeasons(2022, 2023)));
    expect(first).toBeLessThan(35);
    expect(early).toBeGreaterThan(45);
    expect(early).toBeGreaterThan(first * 2);
    expect(wide).toBeLessThan(early * 0.7);
    expect(ground).toBeGreaterThan(wide);
  });

  it('retire cars about as often as the real ones broke down', () => {
    for (const season of SEASONS) {
      const list = inSeasons(season, season);
      const real = Object.values(REAL_PACE[season]!).reduce((sum, team) => sum + team.mechanical * team.starts, 0) / list.length;
      const failures = mean(
        list.map(
          (run) =>
            run.rows.filter((row) => !['Finished', 'Accident', 'Collision', 'Out of fuel', 'Disqualified'].includes(row.status) && !row.status.startsWith('+')).length,
        ),
      );
      expect(failures, `${season}: real ${real.toFixed(2)}`).toBeGreaterThan(real * 0.5 - 0.3);
      expect(failures, `${season}: real ${real.toFixed(2)}`).toBeLessThan(real * 1.6 + 0.6);
    }
  });

  it('see accidents, collisions, safety cars and rain in believable numbers', () => {
    const out = (status: string): number => mean(runs.map((run) => run.rows.filter((row) => row.status === status).length));
    expect(out('Accident')).toBeGreaterThan(0.3);
    expect(out('Accident')).toBeLessThan(1);
    expect(out('Collision')).toBeGreaterThan(0.2);
    expect(out('Collision')).toBeLessThan(1);

    const share = (test: (run: Run) => boolean): number => runs.filter(test).length / runs.length;
    const safetyCar = share((run) => run.state.events.some((event) => event.type === 'safety-car'));
    const expected = mean(runs.map((run) => run.state.setup.traits.safetyCar));
    expect(safetyCar).toBeGreaterThan(expected - 0.12);
    expect(safetyCar).toBeLessThan(expected + 0.12);
    const wet = share((run) => run.state.declaredWet);
    expect(wet).toBeGreaterThan(0.1);
    expect(wet).toBeLessThan(0.3);
    expect(share((run) => run.state.redFlags > 0)).toBeLessThan(0.1);

    const finishers = mean(runs.map((run) => run.rows.filter((row) => row.status === 'Finished' || row.status.startsWith('+')).length / run.rows.length));
    expect(finishers).toBeGreaterThan(0.78);
    expect(finishers).toBeLessThan(0.93);
  });

  it('reward the front of the grid without making the race a formality', () => {
    const winners = runs.map((run) => run.rows[0]!.grid);
    const share = (test: (grid: number) => boolean): number => winners.filter(test).length / winners.length;
    expect(share((grid) => grid === 1)).toBeGreaterThan(0.35);
    expect(share((grid) => grid === 1)).toBeLessThan(0.7);
    expect(share((grid) => grid <= 3)).toBeGreaterThan(0.75);
    expect(share((grid) => grid > 3)).toBeGreaterThan(0.04);
  });
});
