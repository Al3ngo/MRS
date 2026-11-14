import { describe, expect, it } from 'vitest';
import {
  PUSH,
  PUSH_LEVELS,
  STRESS_FREE,
  command,
  createRace,
  raceSetup,
  realEntrants,
  stressMistakes,
  stressPace,
  step,
  type CarState,
  type PushLevel,
  type RaceState,
} from '../src/game/sim';

/** A race with the player's Ferraris, on a dry day. */
const race = (seed = 4): RaceState =>
  createRace({ ...raceSetup(2019, 5, 'race', realEntrants(2019, 5, 'ferrari')), weather: [] }, seed);

const lapsOf = (state: RaceState, car: CarState, laps: number, each?: () => void): void => {
  const until = car.lap + laps;
  while (car.lap < until && state.phase !== 'finished' && car.status === 'running') {
    step(state);
    each?.();
  }
};

/** One car alone on the track: no traffic, no defending. */
const alone = (seed = 4): RaceState => {
  const entrant = { ...realEntrants(2019, 5, 'ferrari')[0]!, player: true };
  return createRace({ ...raceSetup(2019, 5, 'race', [entrant]), weather: [] }, seed);
};

describe('push levels', () => {
  it('trade pace for tyres and stress, in order from conserve to all-out', () => {
    expect(PUSH_LEVELS).toEqual(['conserve', 'normal', 'push', 'all-out']);
    for (let i = 1; i < PUSH_LEVELS.length; i++) {
      const [lower, higher] = [PUSH[PUSH_LEVELS[i - 1]!], PUSH[PUSH_LEVELS[i]!]];
      expect(higher.pace).toBeLessThan(lower.pace);
      expect(higher.tyres).toBeGreaterThan(lower.tyres);
      expect(higher.stress).toBeGreaterThan(lower.stress);
    }
    // Normal and conserve shed stress; push and all-out build it.
    expect(PUSH.normal.stress).toBeLessThan(0);
    expect(PUSH.conserve.stress).toBeLessThan(PUSH.normal.stress);
    expect(PUSH.push.stress).toBeGreaterThan(0);
  });

  it('start every car at normal with no stress, and take orders from the pit wall', () => {
    const state = race();
    expect(state.cars.every((car) => car.push === 'normal' && car.stress === 0)).toBe(true);
    expect(command(state, { type: 'push', car: 'ferrari-1', level: 'all-out' })).toBe(true);
    expect(state.cars.find((car) => car.id === 'ferrari-1')!.push).toBe('all-out');
    expect(command(state, { type: 'push', car: 'ferrari-1', level: 'flat-out' as PushLevel })).toBe(false);
  });

  it('make a car quicker and wear its tyres faster, the higher it goes', () => {
    const run = (level: PushLevel) => {
      const state = alone();
      const car = state.cars[0]!;
      command(state, { type: 'plan', car: car.id, stops: [] });
      lapsOf(state, car, 3);
      const [time, wear] = [car.lapStartedAt, car.wear];
      command(state, { type: 'push', car: car.id, level });
      lapsOf(state, car, 2);
      return { time: car.lapStartedAt - time, wear: car.wear - wear, stress: car.stress };
    };
    const [conserve, normal, push, allOut] = (['conserve', 'normal', 'push', 'all-out'] as const).map(run);
    expect(conserve!.time).toBeGreaterThan(normal!.time);
    expect(push!.time).toBeLessThan(normal!.time);
    expect(allOut!.time).toBeLessThan(push!.time);
    // About seven tenths a lap: two laps of all-out against two at normal.
    expect(normal!.time - allOut!.time).toBeGreaterThan(0.9);
    expect(normal!.time - allOut!.time).toBeLessThan(2);
    expect(allOut!.wear).toBeGreaterThan(normal!.wear * 1.3);
    expect(conserve!.wear).toBeLessThan(normal!.wear);
    expect(normal!.stress).toBe(0);
    expect(allOut!.stress).toBeGreaterThan(50);
  });
});

describe('stress', () => {
  it('fills in about three laps of all-out, and drains at the lower levels', () => {
    const state = alone();
    const car = state.cars[0]!;
    command(state, { type: 'push', car: car.id, level: 'all-out' });
    lapsOf(state, car, 1);
    lapsOf(state, car, 3);
    expect(car.stress).toBeGreaterThan(90);
    command(state, { type: 'push', car: car.id, level: 'conserve' });
    lapsOf(state, car, 2);
    const afterConserve = car.stress;
    expect(afterConserve).toBeLessThan(65);
    command(state, { type: 'push', car: car.id, level: 'normal' });
    lapsOf(state, car, 3);
    expect(car.stress).toBeLessThan(afterConserve - 20);
  });

  it('builds while a car holds off another right behind it, even at normal', () => {
    let built = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const state = race(seed);
      let peak = 0;
      while (state.lap < 25 && state.phase !== 'finished') {
        step(state);
        for (const car of state.cars) if (car.push === 'normal' && car.stress > peak) peak = car.stress;
      }
      built = Math.max(built, peak);
    }
    expect(built).toBeGreaterThan(5);
  });

  it('does no harm while low, then makes mistakes far likelier and costs pace near the top', () => {
    expect(stressMistakes(0)).toBe(1);
    expect(stressMistakes(STRESS_FREE)).toBe(1);
    expect(stressMistakes(60)).toBeGreaterThan(1.5);
    expect(stressMistakes(100)).toBeCloseTo(6, 5);
    expect(stressPace(60)).toBe(0);
    expect(stressPace(100)).toBeGreaterThan(0.003);
  });

  it('eases off behind the safety car', () => {
    const state = alone();
    const car = state.cars[0]!;
    command(state, { type: 'push', car: car.id, level: 'all-out' });
    lapsOf(state, car, 3);
    const before = car.stress;
    state.flag = { kind: 'virtual-safety-car', until: state.time + 200, reason: 'Test' };
    for (let i = 0; i < 100; i++) step(state);
    expect(car.stress).toBeLessThan(before - 10);
  });

  it('is told on the radio when the driver is on the limit', () => {
    const state = race(2);
    const car = state.cars.find((candidate) => candidate.id === 'ferrari-1')!;
    command(state, { type: 'push', car: car.id, level: 'all-out' });
    lapsOf(state, car, 5);
    expect(state.events.some((event) => event.type === 'radio' && event.car === car.id && event.message === 'on-the-limit')).toBe(true);
  });
});

describe('all-out', () => {
  /** Mean time gained against normal by a burst of all-out from lap 10, and the share of cars that do not finish. */
  const burst = (laps: number, seeds: number) => {
    let gained = 0;
    let finishers = 0;
    let out = 0;
    for (let seed = 0; seed < seeds; seed++) {
      const times: (number | null)[] = [];
      for (const length of [0, laps]) {
        const state = alone(seed);
        const car = state.cars[0]!;
        car.auto = true;
        while (state.phase !== 'finished') {
          step(state);
          car.push = car.lap >= 10 && car.lap < 10 + length ? 'all-out' : 'normal';
        }
        times.push(car.status === 'finished' ? car.finishTime : null);
      }
      if (times[1] === null) out += 1;
      const [plain, pushed] = times;
      if (plain != null && pushed != null) {
        gained += plain - pushed;
        finishers += 1;
      }
    }
    return { gained: gained / finishers, out: out / seeds };
  };

  it('pays in a short burst and costs when held, in time or in cars lost', () => {
    const short = burst(2, 120);
    const long = burst(20, 120);
    const normal = burst(0, 120);
    expect(short.gained).toBeGreaterThan(0.2);
    expect(short.out).toBeLessThanOrEqual(normal.out + 0.02);
    expect(long.out).toBeGreaterThan(normal.out + 0.03);
    expect(long.gained).toBeLessThan(short.gained);
  });
});
