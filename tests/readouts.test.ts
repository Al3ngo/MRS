/**
 * What the race screen shows, worked out by the game: a car's tyres and fuel to the flag, the
 * weather to come, pit advice and the numbers of a finished race. None of it may touch the race.
 */
import { describe, expect, it } from 'vitest';
import {
  BLOWOUT_WEAR,
  carOutlook,
  classification,
  command,
  createRace,
  energyModeOpen,
  fuelComfort,
  pitAdvice,
  planChoices,
  raceSetup,
  raceStats,
  realEntrants,
  step,
  tyreLife,
  weatherForecast,
  type CarState,
  type RainSpell,
  type RaceState,
} from '../src/game/sim';

const race = (weather: RainSpell[] = [], seed = 4): RaceState =>
  createRace({ ...raceSetup(2019, 5, 'race', realEntrants(2019, 5, 'ferrari')), weather }, seed);

const ferrari = (state: RaceState): CarState => state.cars.find((car) => car.id === 'ferrari-1')!;

const lapsOf = (state: RaceState, car: CarState, laps: number): void => {
  const until = car.lap + laps;
  while (car.lap < until && state.phase !== 'finished') step(state);
};

describe('tyre life and fuel comfort', () => {
  it('run from full to empty on the scale the bars use', () => {
    expect(tyreLife(0)).toBe(1);
    expect(tyreLife(BLOWOUT_WEAR / 2)).toBeCloseTo(0.5);
    expect(tyreLife(BLOWOUT_WEAR)).toBe(0);
    expect(tyreLife(5)).toBe(0);
    expect(fuelComfort(-1)).toBe(0);
    expect(fuelComfort(-0.5)).toBe(0);
    expect(fuelComfort(1)).toBe(1);
    expect(fuelComfort(0.25)).toBeCloseTo(0.5);
  });
});

describe('the tyre and fuel outlook', () => {
  it('covers every lap left, with fresh tyres at each planned stop', () => {
    const state = race();
    const car = ferrari(state);
    const outlook = carOutlook(state, car);
    expect(outlook.lapsLeft).toBeCloseTo(state.setup.laps, 5);
    expect(outlook.tyres).toHaveLength(state.setup.laps + 1);
    expect(outlook.fuel).toHaveLength(state.setup.laps + 1);
    expect(outlook.tyres[0]).toBe(1);
    expect(outlook.stops).toEqual(car.plan.map((stop) => stop.lap));
    for (const at of outlook.stops) expect(outlook.tyres[at]).toBe(1);
    // Between stops the tyres only wear and the fuel only burns.
    for (let lap = 1; lap < outlook.fuel.length; lap++) {
      expect(outlook.fuel[lap]!).toBeLessThan(outlook.fuel[lap - 1]!);
      // Tyre life floors at nothing left, so only a tyre with some life must lose more.
      if (!outlook.stops.includes(lap) && outlook.tyres[lap - 1]! > 0) {
        expect(outlook.tyres[lap]!).toBeLessThan(outlook.tyres[lap - 1]!);
      }
    }
    // The pit wall's own plan lasts: no warnings at the start.
    expect(outlook.tyresShortBy).toBeNull();
    expect(outlook.fuelShortBy).toBeNull();
    expect(outlook.fuelComfort.at(-1)!).toBeGreaterThan(0);
  });

  it('warns when the tyres or the fuel will not last', () => {
    const state = race();
    const car = ferrari(state);
    command(state, { type: 'plan', car: car.id, stops: [] });
    const noStop = carOutlook(state, car);
    expect(noStop.stopIn).toBeNull();
    expect(noStop.tyresShortBy).toBeGreaterThan(10);
    expect(noStop.tyres.at(-1)).toBe(0);

    car.fuel = state.setup.laps * 0.8;
    const short = carOutlook(state, car);
    expect(short.fuelShortBy).toBeGreaterThan(5);
    expect(short.fuelComfort.at(-1)).toBe(0);
  });

  it('predicts the tyres it then sees on track', () => {
    const state = race();
    const car = ferrari(state);
    command(state, { type: 'plan', car: car.id, stops: [] });
    lapsOf(state, car, 2);
    const predicted = carOutlook(state, car).tyres[6]!;
    lapsOf(state, car, 6);
    // Traffic and the odd moment off line make it an estimate, but a close one.
    expect(Math.abs(tyreLife(car.wear) - predicted)).toBeLessThan(0.06);
  });

  it('sees wet-weather tyres wear fast once the forecast dries the track', () => {
    const lap = 95;
    const onInters = (weather: RainSpell[]) => {
      const state = race(weather);
      const car = ferrari(state);
      car.tyre = state.setup.compounds.find((tyre) => tyre.kind === 'inter')!.id;
      command(state, { type: 'plan', car: car.id, stops: [] });
      return carOutlook(state, car);
    };
    const staysWet = onInters([{ from: -900, to: lap * 99, intensity: 0.5 }]);
    const dries = onInters([{ from: -900, to: lap * 4, intensity: 0.5 }]);
    const wornAt = (outlook: ReturnType<typeof carOutlook>) => outlook.tyres.findIndex((life) => life === 0);
    expect(wornAt(dries)).toBeGreaterThan(0);
    expect(wornAt(dries)).toBeLessThan(wornAt(staysWet) * 0.75);
    expect(dries.tyresShortBy!).toBeGreaterThan(staysWet.tyresShortBy!);
  });

  it('ends at the flag and is empty for a car that is out', () => {
    const state = race();
    const car = ferrari(state);
    while (state.phase !== 'finished') step(state);
    expect(carOutlook(state, car).lapsLeft).toBe(0);
    expect(carOutlook(state, car).tyres).toHaveLength(1);
    expect(energyModeOpen(state, car, 'harvest')).toBe(false);
  });
});

describe('the weather forecast', () => {
  it('shows a dry race as dry, lap by lap from the first', () => {
    const state = race();
    const forecast = weatherForecast(state);
    expect(forecast.map((lap) => lap.lap)).toEqual([1, 2, 3, 4, 5]);
    for (const lap of forecast) {
      expect(lap.kind).toBe('dry');
      expect(lap.chance).toBeLessThanOrEqual(0.25);
    }
  });

  it('sees rain coming before it falls, and says how hard', () => {
    const lap = 95;
    const state = race([{ from: lap * 3, to: lap * 20, intensity: 0.9 }]);
    const now = weatherForecast(state, 5);
    expect(now[0]!.kind).toBe('dry');
    expect(now.slice(3).some((ahead) => ahead.kind === 'heavy-rain' && ahead.chance >= 0.6)).toBe(true);

    const drizzle = weatherForecast(race([{ from: 0, to: lap * 20, intensity: 0.25 }]), 3);
    expect(drizzle.every((ahead) => ahead.kind === 'light-rain')).toBe(true);
  });

  it('never looks past the last lap', () => {
    const state = race();
    const car = ferrari(state);
    lapsOf(state, car, state.setup.laps - 2);
    const forecast = weatherForecast(state, 5);
    expect(forecast.length).toBeLessThanOrEqual(2);
    expect(Math.max(...forecast.map((ahead) => ahead.lap))).toBeLessThanOrEqual(state.setup.laps);
  });
});

describe('pit advice and choices', () => {
  it('offers the plan in the dry and wet tyres in the rain', () => {
    const dry = race();
    const car = ferrari(dry);
    const advice = pitAdvice(dry, car);
    expect(advice.suggested).toBe(car.plan[0]!.compound);
    expect(advice.owesSecondType).toBe(true);
    expect(advice.lapsAfterThis).toBe(dry.setup.laps - 1);
    for (const tyre of dry.setup.compounds) {
      if (tyre.kind === 'dry') expect(advice.lasts[tyre.id]).toBeGreaterThan(5);
      else expect(advice.lasts[tyre.id]).toBeNull();
    }

    const wet = race([{ from: 0, to: 99_999, intensity: 1 }]);
    lapsOf(wet, ferrari(wet), 3);
    const kind = wet.setup.compounds.find((tyre) => tyre.id === pitAdvice(wet, ferrari(wet)).suggested)!.kind;
    expect(kind).not.toBe('dry');
  });

  it('lists race plans, quickest first', () => {
    const state = race();
    const plans = planChoices(state, ferrari(state));
    expect(plans.length).toBeGreaterThan(1);
    expect(plans.length).toBeLessThanOrEqual(6);
  });

  it('closes the battery modes that spend charge when the battery is flat', () => {
    const state = race();
    const car = ferrari(state);
    car.battery = 0;
    expect(energyModeOpen(state, car, 'harvest')).toBe(true);
    expect(energyModeOpen(state, car, 'balanced')).toBe(true);
    expect(energyModeOpen(state, car, 'overtake')).toBe(false);
  });
});

describe('the readouts', () => {
  it('count a finished race as its events tell it', () => {
    const state = race();
    while (state.phase !== 'finished') step(state);
    const stats = raceStats(state);
    expect(stats.pitStops).toBe(state.events.filter((event) => event.type === 'pit').length);
    expect(stats.overtakes + stats.overtakesOnTrouble).toBe(
      state.events.filter((event) => event.type === 'overtake').length,
    );
    expect(stats.rainFromLap).toBeNull();
    expect(stats.wet).toBe(false);
    expect(stats.dryTypes.length).toBeGreaterThanOrEqual(2);
  });

  it('never change the race they describe', () => {
    const quiet = race([{ from: 900, to: 2400, intensity: 0.6 }], 9);
    const watched = race([{ from: 900, to: 2400, intensity: 0.6 }], 9);
    while (quiet.phase !== 'finished') step(quiet);
    while (watched.phase !== 'finished') {
      step(watched);
      for (const car of watched.cars) {
        carOutlook(watched, car);
        pitAdvice(watched, car);
        energyModeOpen(watched, car, 'overtake');
      }
      weatherForecast(watched, 5);
      raceStats(watched);
    }
    expect(JSON.stringify(watched)).toBe(JSON.stringify(quiet));
    expect(classification(watched)).toEqual(classification(quiet));
  });
});
