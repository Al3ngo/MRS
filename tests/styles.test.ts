/**
 * Every team in the simulation runs its cars under the same rules as the player, with its own
 * style: aggressive teams push harder and gamble on strategy, cautious ones look after the car.
 */
import { describe, expect, it } from 'vitest';
import { TEAMS, teamStyle, teamsIn } from '../src/game/data';
import {
  STYLES,
  createRace,
  qualifyingFor,
  raceSetup,
  realEntrants,
  runPart,
  step,
  styleOf,
  type Entrant,
  type TeamStyle,
} from '../src/game/sim';

const allAs = (style: TeamStyle, season = 2019, round = 5): Entrant[] =>
  realEntrants(season, round).map((entrant) => ({ ...entrant, style }));

/** Seconds per car spent at each push level, and pit stops per car, over whole races. */
function habits(style: TeamStyle, seeds: number[]) {
  const time = { conserve: 0, normal: 0, push: 0, 'all-out': 0 };
  let stops = 0;
  let cars = 0;
  for (const seed of seeds) {
    const race = createRace({ ...raceSetup(2019, 5, 'race', allAs(style)), weather: [] }, seed);
    while (race.phase !== 'finished') {
      step(race);
      for (const car of race.cars) if (car.status === 'running') time[car.push] += 1;
    }
    stops += race.events.filter((event) => event.type === 'pit').length;
    cars += race.cars.length;
  }
  return { time, stops: stops / cars, cars };
}

describe('team race styles', () => {
  it('keep the balanced style exactly as the simulation always ran', () => {
    const balanced = STYLES.balanced;
    expect(balanced.conserveAbove).toBe(55);
    expect(balanced.allOutLaps).toBe(2);
    expect(balanced.rainNerve).toBe(0);
    expect(balanced.changeWornAt).toBe(1.3);
    expect(balanced.qualifying).toEqual(['normal', 'normal', 'normal']);
    expect(styleOf({})).toBe(balanced);
  });

  it('give every team a style in every season it raced', () => {
    for (let season = 2010; season <= 2026; season++) {
      for (const team of teamsIn(season)) {
        expect(['aggressive', 'balanced', 'cautious']).toContain(team.style);
        expect(team.style).toBe(teamStyle(team.team, season));
      }
    }
    expect(teamStyle('red-bull', 2013)).toBe('aggressive');
    expect(teamStyle('ferrari', 2019)).toBe('balanced');
    expect(teamStyle('williams', 2019)).toBe('cautious');
    expect(teamStyle('mclaren', 2016)).toBe('balanced');
    expect(teamStyle('mclaren', 2024)).toBe('aggressive');
    // Every team in the record has a style for its whole life.
    for (const team of TEAMS) expect(() => teamStyle(team.id, team.seasons[0])).not.toThrow();
  });

  it('reach the cars on the grid', () => {
    const entrants = realEntrants(2019, 5);
    expect(entrants.find((entrant) => entrant.team === 'red-bull')!.style).toBe('aggressive');
    expect(entrants.find((entrant) => entrant.team === 'williams')!.style).toBe('cautious');
  });

  it('decide how hard the simulation goes in qualifying', () => {
    const run = (style: TeamStyle, approach?: 'safe' | 'normal' | 'push') => {
      const entrants = allAs(style);
      const state = qualifyingFor(2019, 5, entrants, 11);
      const orders = approach ? Object.fromEntries(entrants.map((entrant) => [entrant.id, approach])) : {};
      return runPart(state, orders);
    };
    expect(run('cautious')).toEqual(run('balanced', 'safe'));
    expect(run('aggressive')).toEqual(run('balanced', 'normal'));
    expect(run('balanced')).toEqual(run('aggressive', 'normal'));
    // The player's own cars take no style: without an order they go at normal.
    const mine = allAs('cautious').map((entrant) => ({ ...entrant, player: entrant.team === 'ferrari' }));
    const ferrari = (part: ReturnType<typeof runPart>) => part.laps.filter((lap) => lap.car.startsWith('ferrari'));
    const free = runPart(qualifyingFor(2019, 5, mine, 11));
    const told = runPart(qualifyingFor(2019, 5, mine, 11), { 'ferrari-1': 'normal', 'ferrari-2': 'normal' });
    expect(ferrari(free)).toEqual(ferrari(told));
  });

  it('run races in character: cautious never all-out, aggressive pushes most', { timeout: 120_000 }, () => {
    const seeds = [1, 2, 3];
    const cautious = habits('cautious', seeds);
    const balanced = habits('balanced', seeds);
    const aggressive = habits('aggressive', seeds);
    expect(cautious.time['all-out']).toBe(0);
    expect(aggressive.time['all-out']).toBeGreaterThan(balanced.time['all-out']);
    expect(aggressive.time.push).toBeGreaterThan(balanced.time.push);
    expect(balanced.time.push).toBeGreaterThan(cautious.time.push);
    expect(cautious.time.conserve).toBeGreaterThan(aggressive.time.conserve);
    // All-out stays a burst for everyone: well under a tenth of the race even for the boldest.
    const raceTime = (h: typeof aggressive) => Object.values(h.time).reduce((a, b) => a + b, 0);
    expect(aggressive.time['all-out'] / raceTime(aggressive)).toBeLessThan(0.05);
  });
});
