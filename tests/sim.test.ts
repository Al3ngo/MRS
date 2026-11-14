import { describe, expect, it } from 'vitest';
import { calendar, knockoutCuts, rulesFor } from '../src/game/data';
import {
  NEUTRAL_SETUP,
  carScore,
  classification,
  command,
  compoundsFor,
  createQualifying,
  createRace,
  energyModes,
  feedbackPrecision,
  gridOrder,
  idealKind,
  idealSetup,
  planRace,
  quickRace,
  raceSetup,
  realEntrants,
  roundFacts,
  runPart,
  runQualifying,
  runToEnd,
  sessionRules,
  setupFeedback,
  setupQuality,
  step,
  type Entrant,
  type RaceEvent,
  type RaceState,
  type RainSpell,
  type SessionSetup,
} from '../src/game/sim';

/** A real round with the cars lined up fastest first, and the weather decided by the test. */
function setupFor(
  season: number,
  round: number,
  options: { kind?: 'race' | 'sprint'; weather?: RainSpell[] | null; player?: string } = {},
): SessionSetup {
  const { traits } = roundFacts(season, round);
  const grid = realEntrants(season, round, options.player).sort(
    (a, b) => carScore(b.car, traits) + b.ratings.pace * 0.3 - (carScore(a.car, traits) + a.ratings.pace * 0.3),
  );
  const setup = raceSetup(season, round, options.kind ?? 'race', grid);
  return options.weather === null ? setup : { ...setup, weather: options.weather ?? [] };
}

const eventsOf = <T extends RaceEvent['type']>(state: RaceState, type: T): Extract<RaceEvent, { type: T }>[] =>
  state.events.filter((event): event is Extract<RaceEvent, { type: T }> => event.type === type);

const finished = (setup: SessionSetup, seed: number): RaceState => {
  const state = createRace(setup, seed);
  runToEnd(state);
  return state;
};

describe('a race', () => {
  it('is the same race every time for the same seed, and a different one for another', () => {
    const a = quickRace(2016, 5, 11).race;
    const b = quickRace(2016, 5, 11).race;
    const c = quickRace(2016, 5, 12).race;
    for (const state of [a, b, c]) runToEnd(state);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.events)).not.toBe(JSON.stringify(c.events));
  });

  it('carries on unchanged after being saved and loaded half way', () => {
    for (const [season, round, seed] of [[2012, 3, 5], [2021, 12, 9], [2026, 2, 4]] as const) {
      const straight = quickRace(season, round, seed).race;
      for (let i = 0; i < 1500; i++) step(straight);
      const loaded = JSON.parse(JSON.stringify(straight)) as RaceState;
      runToEnd(straight);
      runToEnd(loaded);
      expect(JSON.stringify(loaded), `${season} round ${round}`).toBe(JSON.stringify(straight));
    }
  });

  it('runs the scheduled distance and classifies every starter exactly once', () => {
    const setup = setupFor(2018, 10);
    const state = finished(setup, 3);
    const rows = classification(state);
    expect(rows.map((row) => row.position)).toEqual(rows.map((_, index) => index + 1));
    expect(new Set(rows.map((row) => row.car)).size).toBe(setup.grid.length);
    expect(rows[0]!.laps).toBe(setup.laps);
    expect(rows[0]!.status).toBe('Finished');
    expect(state.endedEarly).toBe(false);
    // Lap times stay close to the real thing: a race lap is a few percent off the weekend's best.
    const quickest = state.fastestLap!.lapTime / setup.refLap;
    expect(quickest).toBeGreaterThan(1.02);
    expect(quickest).toBeLessThan(1.08);
    expect(state.time).toBeLessThan(2 * 3600);
  });

  it('ranks by laps, then by time, and counts a late retirement as classified', () => {
    const state = finished(setupFor(2010, 3), 8);
    const rows = classification(state);
    for (let i = 1; i < rows.length; i++) {
      const [ahead, behind] = [rows[i - 1]!, rows[i]!];
      if (ahead.classified && behind.classified) expect(ahead.laps).toBeGreaterThanOrEqual(behind.laps);
      if (ahead.time !== null && behind.time !== null) expect(ahead.time).toBeLessThanOrEqual(behind.time);
      if (!ahead.classified) expect(behind.classified).toBe(false);
    }
    const needed = Math.floor(rows[0]!.laps * 0.9);
    for (const row of rows) {
      if (row.status !== 'Disqualified') expect(row.classified, row.car).toBe(row.laps >= needed);
    }
  });
});

describe('points', () => {
  it('follow the season: 25 for a win, and the fastest lap point only in its years', () => {
    for (const season of [2010, 2019, 2025]) {
      const state = finished(setupFor(season, 2), 6);
      const rows = classification(state);
      expect(rows[0]!.points).toBeGreaterThanOrEqual(25);
      const total = rows.reduce((sum, row) => sum + row.points, 0);
      const holder = rows.find((row) => row.fastestLap)!;
      const bonus = rulesFor(season).fastestLapPoint && holder.classified && holder.position <= 10 ? 1 : 0;
      expect(total, `${season}`).toBe(101 + bonus);
      if (!rulesFor(season).fastestLapPoint) expect(rows[0]!.points).toBe(25);
    }
  });

  it('are doubled at the 2014 finale', () => {
    const last = calendar(2014).length;
    const rows = classification(finished(setupFor(2014, last), 2));
    expect(rows[0]!.points).toBe(50);
    expect(classification(finished(setupFor(2014, last - 1), 2))[0]!.points).toBe(25);
  });

  it('are the sprint table in a sprint, with no stop needed', () => {
    const round = calendar(2023).find((candidate) => candidate.sprintLaps !== null)!;
    const setup = setupFor(2023, round.round, { kind: 'sprint' });
    expect(setup.laps).toBe(round.sprintLaps);
    const rows = classification(finished(setup, 5));
    expect(rows.slice(0, 8).map((row) => row.points)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect(rows[8]!.points).toBe(0);
    expect(rows.some((row) => row.status === 'Disqualified')).toBe(false);
    expect(rows.filter((row) => row.stops === 0).length).toBeGreaterThan(rows.length / 2);
  });
});

describe('the rules of each era', () => {
  const watch = (season: number, round: number, seed: number) => {
    const state = createRace(setupFor(season, round), seed);
    let opened = 0;
    let openedEarly = 0;
    let charged = 0;
    while (state.phase !== 'finished') {
      step(state);
      for (const car of state.cars) {
        if (car.aidOpen) {
          opened += 1;
          if (state.lap < 2) openedEarly += 1;
        }
        if (car.battery > 0) charged += 1;
      }
    }
    return { state, opened, openedEarly, charged };
  };

  it('2010: no overtaking aid and no energy recovery', () => {
    const { state, opened, charged } = watch(2010, 4, 2);
    expect(opened).toBe(0);
    expect(charged).toBe(0);
    expect(energyModes(state.setup.rules.recovery)).toEqual([]);
  });

  it('2012: DRS from the third lap, and a KERS boost button', () => {
    const { state, opened, openedEarly, charged } = watch(2012, 4, 2);
    expect(opened).toBeGreaterThan(100);
    expect(openedEarly).toBe(0);
    expect(charged).toBeGreaterThan(0);
    expect(energyModes(state.setup.rules.recovery)).toEqual(['harvest', 'balanced', 'overtake']);
  });

  it('2019: hybrid deployment modes; 2026: no DRS, the boost only for a car close behind another', () => {
    expect(energyModes(sessionRules(2019, 'race').recovery)).toEqual(['harvest', 'balanced', 'attack', 'overtake']);
    const { opened, charged } = watch(2026, 3, 2);
    expect(opened).toBe(0);
    expect(charged).toBeGreaterThan(0);
  });

  it('has the virtual safety car from 2015 and never before', () => {
    const count = (season: number): number => {
      let seen = 0;
      for (const round of calendar(season)) {
        seen += eventsOf(finished(setupFor(season, round.round, { weather: null }), round.round), 'virtual-safety-car').length;
      }
      return seen;
    };
    expect(count(2014)).toBe(0);
    expect(count(2019)).toBeGreaterThan(0);
  });

  it('brings two dry compounds before 2016 and three after, softest quickest and shortest-lived', () => {
    for (const season of [2010, 2013, 2015, 2016, 2018, 2019, 2026]) {
      const tyres = compoundsFor(season, { tyreWear: 3 }, 60);
      const dry = tyres.filter((tyre) => tyre.kind === 'dry');
      expect(dry.length, `${season}`).toBe(season <= 2015 ? 2 : 3);
      expect(tyres.slice(-2).map((tyre) => tyre.kind)).toEqual(['inter', 'wet']);
      expect(new Set(tyres.map((tyre) => tyre.id)).size).toBe(tyres.length);
      expect(new Set(dry.map((tyre) => tyre.colour)).size, `${season} colours`).toBe(dry.length);
      for (let i = 1; i < dry.length; i++) {
        expect(dry[i]!.pace).toBeGreaterThan(dry[i - 1]!.pace);
        expect(dry[i]!.life).toBeGreaterThan(dry[i - 1]!.life);
      }
    }
  });
});

describe('tyres and stops', () => {
  it('plans use two dry compounds, with stops in order and inside the race', () => {
    for (const season of [2010, 2012, 2017, 2023]) {
      const setup = setupFor(season, 5);
      for (const entrant of setup.grid) {
        const plan = planRace(setup, entrant, { rng: 7 });
        const used = new Set([plan.start, ...plan.stops.map((stop) => stop.compound)]);
        expect(used.size, `${season} ${entrant.id}`).toBeGreaterThanOrEqual(2);
        expect(plan.stops.length).toBeGreaterThanOrEqual(1);
        plan.stops.forEach((stop, i) => {
          expect(stop.lap).toBeGreaterThan(i === 0 ? 0 : plan.stops[i - 1]!.lap);
          expect(stop.lap).toBeLessThan(setup.laps);
        });
      }
    }
  });

  it('every finisher the simulation runs has used two dry compounds in a dry race', () => {
    for (const [season, seed] of [[2011, 1], [2015, 2], [2020, 3], [2024, 4]] as const) {
      const state = finished(setupFor(season, 6), seed);
      const rows = classification(state);
      expect(rows.some((row) => row.status === 'Disqualified'), `${season}`).toBe(false);
      for (const car of state.cars) {
        if (car.status === 'finished') expect(new Set(car.usedCompounds).size, car.id).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('disqualifies a car that runs a dry race on one compound', () => {
    // Monaco 2010: the harder Bridgestone will go the whole distance.
    const setup = setupFor(2010, 6, { player: 'ferrari' });
    const hard = setup.compounds.filter((tyre) => tyre.kind === 'dry').at(-1)!;
    let seen = false;
    for (let seed = 1; seed <= 6 && !seen; seed++) {
      const state = createRace(setup, seed);
      expect(command(state, { type: 'plan', car: 'ferrari-1', stops: [], start: hard.id })).toBe(true);
      runToEnd(state);
      const car = state.cars.find((candidate) => candidate.id === 'ferrari-1')!;
      if (car.status !== 'finished' || car.stops > 0) continue;
      seen = true;
      const row = classification(state).find((candidate) => candidate.car === 'ferrari-1')!;
      expect(row.status).toBe('Disqualified');
      expect(row.points).toBe(0);
      expect(row.position).toBe(setup.grid.length);
    }
    expect(seen).toBe(true);
  });

  it('lifts the two-compound rule once wet-weather tyres have been used', () => {
    const rain: RainSpell[] = [{ from: -2000, to: 20000, intensity: 0.45 }];
    const state = finished(setupFor(2013, 2, { weather: rain }), 4);
    expect(state.declaredWet).toBe(true);
    expect(idealKind(state.wetness)).toBe('inter');
    const rows = classification(state);
    expect(rows.some((row) => row.status === 'Disqualified')).toBe(false);
    const finishers = state.cars.filter((car) => car.status === 'finished');
    expect(finishers.length).toBeGreaterThan(10);
    for (const car of finishers) expect(car.usedCompounds).toContain('intermediate');
  });

  it('sends the field to the pits for intermediates when it rains, and back when it dries', () => {
    const rain: RainSpell[] = [{ from: 1200, to: 2400, intensity: 0.5 }];
    const state = finished(setupFor(2019, 11, { weather: rain }), 2);
    expect(eventsOf(state, 'rain').map((event) => event.state)).toEqual(['coming', 'started', 'stopped']);
    const pits = eventsOf(state, 'pit');
    expect(pits.filter((pit) => pit.compound === 'intermediate').length).toBeGreaterThan(12);
    const back = pits.filter((pit) => pit.compound !== 'intermediate' && pit.time > 2400);
    expect(back.length).toBeGreaterThan(10);
    // Nobody is on wet-weather tyres at the start of a dry race.
    const dry = createRace(setupFor(2019, 11), 2);
    expect(dry.cars.every((car) => dry.setup.compounds.find((tyre) => tyre.id === car.tyre)!.kind === 'dry')).toBe(true);
  });
});

describe('the pit wall', () => {
  const playerRace = (seed = 3): RaceState => createRace(setupFor(2019, 3, { player: 'ferrari' }), seed);
  const lapsOf = (state: RaceState, id: string, laps: number): void => {
    const car = state.cars.find((candidate) => candidate.id === id)!;
    while (car.lap < laps && state.phase !== 'finished' && car.status !== 'out') step(state);
  };

  it('leaves the player\'s cars to the player: they stop when planned or called, not otherwise', () => {
    const state = playerRace();
    const car = state.cars.find((candidate) => candidate.id === 'ferrari-1')!;
    expect(car.auto).toBe(false);
    expect(command(state, { type: 'plan', car: car.id, stops: [] })).toBe(true);
    lapsOf(state, car.id, 12);
    expect(car.stops).toBe(0);

    expect(command(state, { type: 'pit', car: car.id, compound: 'no-such-tyre' })).toBe(false);
    expect(command(state, { type: 'pit', car: car.id, compound: 'hard' })).toBe(true);
    expect(command(state, { type: 'cancel-pit', car: car.id })).toBe(true);
    lapsOf(state, car.id, 14);
    expect(car.stops).toBe(0);

    command(state, { type: 'pit', car: car.id, compound: 'hard' });
    lapsOf(state, car.id, 16);
    expect(car.stops).toBe(1);
    expect(car.tyre).toBe('hard');
    expect(car.usedCompounds).toContain('hard');
    expect(eventsOf(state, 'pit').some((pit) => pit.car === car.id && pit.compound === 'hard')).toBe(true);
  });

  it('can hand a car to the simulation, which then makes the stops itself', () => {
    const state = playerRace(5);
    for (const id of ['ferrari-1', 'ferrari-2']) {
      command(state, { type: 'plan', car: id, stops: [] });
      command(state, { type: 'auto', car: id, on: true });
    }
    runToEnd(state);
    for (const row of classification(state)) expect(row.status).not.toBe('Disqualified');
  });

  it('trades speed for fuel with the engine mode', () => {
    const run = (mode: 'save' | 'push') => {
      const state = playerRace(9);
      const car = state.cars.find((candidate) => candidate.id === 'ferrari-1')!;
      command(state, { type: 'engine-mode', car: car.id, mode });
      lapsOf(state, car.id, 10);
      return { fuel: car.fuel, time: car.lapStartedAt, wear: car.engineWear, state };
    };
    const [save, push] = [run('save'), run('push')];
    expect(push.fuel).toBeLessThan(save.fuel - 1);
    expect(push.wear).toBeGreaterThan(save.wear * 2);
    expect(push.time).toBeLessThan(save.time);
    // Pushing all the way does not reach the finish: the driver says so.
    runToEnd(push.state);
    const radio = eventsOf(push.state, 'radio').filter((event) => event.car === 'ferrari-1');
    expect(radio.some((event) => event.message === 'fuel-low')).toBe(true);
  });

  it('drains the battery in overtake mode and falls back when it is empty', () => {
    const state = playerRace(4);
    const car = state.cars.find((candidate) => candidate.id === 'ferrari-2')!;
    expect(command(state, { type: 'energy-mode', car: car.id, mode: 'overtake' })).toBe(true);
    const before = car.battery;
    lapsOf(state, car.id, 4);
    expect(car.battery).toBeLessThan(before);
    expect(car.energyMode).toBe('balanced');
    expect(eventsOf(state, 'radio').some((event) => event.car === car.id && event.message === 'battery-empty')).toBe(true);
    expect(command(state, { type: 'energy-mode', car: car.id, mode: 'overtake' })).toBe(false);
    expect(command(state, { type: 'energy-mode', car: car.id, mode: 'harvest' })).toBe(true);
    lapsOf(state, car.id, 7);
    expect(car.battery).toBeGreaterThan(20);
  });

  it('refuses energy modes the season does not have', () => {
    const early = createRace(setupFor(2010, 1, { player: 'ferrari' }), 1);
    expect(command(early, { type: 'energy-mode', car: 'ferrari-1', mode: 'overtake' })).toBe(false);
    const kers = createRace(setupFor(2012, 1, { player: 'ferrari' }), 1);
    expect(command(kers, { type: 'energy-mode', car: 'ferrari-1', mode: 'attack' })).toBe(false);
    expect(command(kers, { type: 'energy-mode', car: 'ferrari-1', mode: 'overtake' })).toBe(true);
  });
});

describe('race control', () => {
  it('bunches the field behind the safety car, with no passing until the restart', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 3; seed++) {
      const state = createRace(setupFor(2012, 14, { weather: [] }), seed);
      let out = false;
      let passesUnder = 0;
      let seen = 0;
      let longEnough = false;
      while (state.phase !== 'finished') {
        const flagBefore: string = state.flag.kind;
        const lapsLeft = state.flag.kind === 'safety-car' ? state.flag.lapsLeft : 0;
        step(state);
        if (state.flag.kind === 'safety-car') {
          if (!out) longEnough = state.setup.laps - state.lap > 8;
          out = true;
        }
        for (; seen < state.events.length; seen++) {
          if (state.events[seen]!.type === 'overtake' && flagBefore === 'safety-car') passesUnder += 1;
        }
        const flagNow: string = state.flag.kind;
        if (flagBefore === 'safety-car' && flagNow === 'green' && longEnough && lapsLeft <= 1) {
          // The restart: the leading cars are nose to tail.
          const front = state.cars.filter((car) => car.status === 'running').sort((a, b) => a.position - b.position);
          expect(front[2]!.gap, `seed ${seed}`).toBeLessThan(4);
          checked += 1;
          break;
        }
      }
      expect(passesUnder).toBe(0);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('stops a flooded race, and pays reduced points if it cannot be restarted', () => {
    const deluge: RainSpell[] = [{ from: 300, to: 40000, intensity: 1 }];
    const modern = finished(setupFor(2023, 3, { weather: deluge }), 2);
    expect(modern.redFlags).toBe(1);
    expect(modern.abandoned).toBe(true);
    expect(modern.endedEarly).toBe(true);
    const rows = classification(modern);
    expect(rows[0]!.laps).toBeGreaterThan(2);
    expect(rows[0]!.laps).toBeLessThan(modern.setup.laps * 0.25);
    expect(rows.slice(0, 6).map((row) => row.points)).toEqual([6, 4, 3, 2, 1, 0]);

    const older = classification(finished(setupFor(2010, 3, { weather: deluge }), 2));
    expect(older[0]!.points).toBe(12.5);
  });

  it('restarts a stopped race once the rain has passed', () => {
    const storm: RainSpell[] = [{ from: 600, to: 1700, intensity: 1 }];
    const state = finished(setupFor(2016, 9, { weather: storm }), 2);
    expect(state.redFlags).toBeGreaterThanOrEqual(1);
    expect(state.abandoned).toBe(false);
    expect(state.stopped).toBeGreaterThan(600);
    expect(eventsOf(state, 'red-flag')[0]!.resumed).toBe(true);
    const rows = classification(state);
    expect(rows[0]!.points).toBe(25);
    expect(rows.filter((row) => row.classified).length).toBeGreaterThan(8);
  });
});

describe('qualifying', () => {
  const entrants = (season: number): Entrant[] => realEntrants(season, 1);
  const quali = (season: number, seed: number, wetness = 0) => {
    const { fact, traits } = roundFacts(season, 1);
    return {
      season,
      round: 1,
      name: fact.name,
      circuit: fact.circuit,
      refLap: fact.refLap,
      traits,
      rules: sessionRules(season, 'race'),
      entrants: entrants(season),
      wetness,
      seed,
    };
  };

  it('knocks out the right number after each part and puts every car on the grid once', () => {
    for (const season of [2010, 2013, 2019, 2026]) {
      const setup = quali(season, 3);
      const state = runQualifying(setup, 3);
      const cars = setup.entrants.length;
      const [first, second] = knockoutCuts(cars);
      expect(state.parts.map((part) => part.laps.length)).toEqual([cars, cars - first, cars - first - second]);
      expect(state.parts[2]!.laps.length).toBe(10);
      const grid = gridOrder(state);
      expect(grid.length).toBe(cars);
      expect(new Set(grid).size).toBe(cars);
      expect(grid[0]).toBe(state.parts[2]!.laps[0]!.car);
      // Pole is close to the real weekend's quickest lap.
      const pole = state.parts[2]!.laps[0]!.time / setup.refLap;
      expect(pole, `${season}`).toBeGreaterThan(0.99);
      expect(pole, `${season}`).toBeLessThan(1.02);
    }
  });

  it('is repeatable, and slower in the wet', () => {
    const setup = quali(2015, 1);
    expect(JSON.stringify(runQualifying(setup, 8))).toBe(JSON.stringify(runQualifying(setup, 8)));
    const dry = runQualifying(setup, 8).parts[0]!.laps[0]!.time;
    const wet = runQualifying(quali(2015, 1, 0.4), 8).parts[0]!.laps[0]!.time;
    expect(wet).toBeGreaterThan(dry * 1.06);
  });

  it('rewards pushing with time, at the price of more ruined laps', () => {
    const setup = quali(2018, 1);
    const tally = { safe: { time: 0, errors: 0 }, push: { time: 0, errors: 0 } };
    for (const approach of ['safe', 'push'] as const) {
      for (let seed = 0; seed < 60; seed++) {
        const state = createQualifying(setup, seed);
        const part = runPart(state, Object.fromEntries(setup.entrants.map((entrant) => [entrant.id, approach])));
        const clean = part.laps.filter((lap) => !lap.error);
        tally[approach].time += clean.reduce((sum, lap) => sum + lap.time, 0) / clean.length;
        tally[approach].errors += part.laps.length - clean.length;
      }
    }
    expect(tally.push.time).toBeLessThan(tally.safe.time);
    expect(tally.push.errors).toBeGreaterThan(tally.safe.errors * 2);
  });
});

describe('practice', () => {
  const { traits } = roundFacts(2019, 14);

  it('has a best setup for each driver and weekend, low wing where power counts', () => {
    const monza = idealSetup(5, traits, 'lewis-hamilton');
    expect(idealSetup(5, traits, 'lewis-hamilton')).toEqual(monza);
    expect(idealSetup(5, traits, 'max-verstappen')).not.toEqual(monza);
    expect(idealSetup(6, traits, 'lewis-hamilton')).not.toEqual(monza);
    const monaco = idealSetup(5, roundFacts(2019, 6).traits, 'lewis-hamilton');
    expect(monaco.wing).toBeGreaterThan(monza.wing + 40);
  });

  it('scores a setup by how close it is', () => {
    const ideal = idealSetup(5, traits, 'lewis-hamilton');
    expect(setupQuality(ideal, ideal)).toBe(1);
    const near = { ...ideal, wing: ideal.wing + 9 };
    expect(setupQuality(near, ideal)).toBeCloseTo(0.9, 5);
    expect(setupQuality(NEUTRAL_SETUP, ideal)).toBeLessThan(1);
  });

  it('gives feedback that leads to the ideal, sharper from a consistent driver', () => {
    const ideal = idealSetup(9, traits, 'fernando-alonso');
    const luck = { rng: 3 };
    const setup = { ...NEUTRAL_SETUP };
    const nudge = { 'much-lower': -12, lower: -4, good: 0, higher: 4, 'much-higher': 12 } as const;
    for (let run = 0; run < 12; run++) {
      const said = setupFeedback(luck, setup, ideal, feedbackPrecision(97));
      for (const dial of ['wing', 'balance', 'ride'] as const) setup[dial] += nudge[said[dial]];
    }
    expect(setupQuality(setup, ideal)).toBeGreaterThan(0.85);
    expect(setupFeedback({ rng: 1 }, ideal, ideal, 1)).toEqual({ wing: 'good', balance: 'good', ride: 'good' });
    expect(feedbackPrecision(95)).toBeGreaterThan(feedbackPrecision(70));
  });
});
