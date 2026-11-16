import { describe, expect, it } from 'vitest';
import { CIRCUITS, calendar, circuit } from '../src/game/data';
import { classification, command, createRace, quickRace, raceSetup, realEntrants, sessionRules, step, type RaceEvent } from '../src/game/sim';
import { LAP_ON_SCREEN, RaceClock } from '../src/ui/race/clock';
import { drawX, drawY, fitTrack, placeOnTrack, trackMap, type TrackPoint } from '../src/ui/race/track';
import { energyWords, feedLine, radioWords, trackWords } from '../src/ui/race/words';

const point = (): TrackPoint => ({ x: 0, y: 0, nx: 0, ny: 0 });

/** Whether a point lies inside a closed outline (x,y pairs). */
function inside(outline: ArrayLike<number>, x: number, y: number): boolean {
  let hit = false;
  const count = outline.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const [xi, yi, xj, yj] = [outline[i * 2]!, outline[i * 2 + 1]!, outline[j * 2]!, outline[j * 2 + 1]!];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

describe('the circuit map', () => {
  it('covers every circuit: a lap that starts on the line, runs forward and closes', () => {
    for (const venue of CIRCUITS) {
      const map = trackMap(venue.outline);
      expect(map.count, venue.id).toBeGreaterThanOrEqual(160);
      expect(map.time[0], venue.id).toBe(0);
      expect(map.time[map.count], venue.id).toBe(1);
      for (let i = 0; i < map.count; i++) expect(map.time[i + 1]! > map.time[i]!, `${venue.id} at ${i}`).toBe(true);
      const start = placeOnTrack(map, 0, point());
      expect(start.x).toBeCloseTo(venue.outline[0]!, 0);
      expect(start.y).toBeCloseTo(venue.outline[1]!, 0);
      // The same place every lap, and just short of the line at the end of one.
      const again = placeOnTrack(map, 7, point());
      expect(again.x).toBeCloseTo(start.x, 3);
      const end = placeOnTrack(map, 0.9999, point());
      expect(Math.hypot(end.x - start.x, end.y - start.y), venue.id).toBeLessThan(30);
      expect(venue.direction === 'clockwise', `${venue.id} direction`).toBe(map.clockwise);
    }
  });

  it('slows cars for the corners and lets them run on the straights', () => {
    const monza = trackMap(circuit('monza').outline);
    const monaco = trackMap(circuit('monaco').outline);
    const fastest = (map: typeof monza): number => Math.max(...map.speed);
    const slowest = (map: typeof monza): number => Math.min(...map.speed);
    const average = (map: typeof monza): number => map.speed.reduce((sum, value) => sum + value, 0) / map.count;
    expect(fastest(monza)).toBeGreaterThan(80);
    expect(slowest(monza)).toBeLessThan(40);
    expect(slowest(monaco)).toBeLessThan(26);
    expect(average(monza)).toBeGreaterThan(average(monaco) * 1.25);
    // A tenth of the lap's time covers less ground in the slow part of a lap than in the fast part.
    const covered = (map: typeof monza, from: number): number => {
      const [a, b] = [placeOnTrack(map, from, point()), placeOnTrack(map, from + 0.02, point())];
      return Math.hypot(b.x - a.x, b.y - a.y);
    };
    const spans = Array.from({ length: 50 }, (_, i) => covered(monza, i / 50));
    expect(Math.max(...spans)).toBeGreaterThan(Math.min(...spans) * 2);
  });

  it('knows which side of the track is the inside', () => {
    // Suzuka is left out: a figure of eight has no single inside.
    for (const id of ['silverstone', 'monza', 'interlagos', 'spa-francorchamps', 'yas-marina']) {
      const map = trackMap(circuit(id).outline);
      let within = 0;
      const samples = 60;
      for (let i = 0; i < samples; i++) {
        const at = placeOnTrack(map, i / samples, point());
        expect(Math.hypot(at.nx, at.ny)).toBeCloseTo(1, 4);
        if (inside(map.points, at.x + at.nx * 12, at.y + at.ny * 12)) within += 1;
      }
      // A tight chicane can fool the test at a few points, never at most.
      expect(within / samples, id).toBeGreaterThan(0.85);
    }
  });

  it('fits any circuit inside the space it is given, turning a tall one on its side', () => {
    for (const venue of CIRCUITS) {
      const map = trackMap(venue.outline);
      for (const [width, height] of [[358, 250], [343, 180], [528, 290]] as const) {
        const fit = fitTrack(map, width, height, 26);
        for (let i = 0; i < map.count; i++) {
          const x = drawX(fit, map.points[i * 2]!, map.points[i * 2 + 1]!);
          const y = drawY(fit, map.points[i * 2]!, map.points[i * 2 + 1]!);
          expect(x >= 25.5 && x <= width - 25.5 && y >= 25.5 && y <= height - 25.5, `${venue.id} in ${width}x${height}`).toBe(true);
        }
      }
    }
    const tall = trackMap([0, 0, 100, 0, 100, 900, 0, 900]);
    expect(fitTrack(tall, 358, 250, 26).turned).toBe(true);
    expect(fitTrack(trackMap([0, 0, 900, 0, 900, 100, 0, 100]), 358, 250, 26).turned).toBe(false);
  });
});

describe('the race clock', () => {
  const fresh = () => new RaceClock(quickRace(2018, 4, 3).race);

  it('stands still when paused and runs the race at the chosen speed', () => {
    const clock = fresh();
    expect(clock.run(100)).toBe(0);
    expect(clock.state.phase).toBe('grid');
    clock.speed = 1;
    let steps = 0;
    for (let frame = 0; frame < 60; frame++) steps += clock.run(1000 / 60);
    // One second of real time is the clock's pace in seconds of racing, give or take a step.
    expect(steps).toBeGreaterThanOrEqual(Math.floor(clock.pace) - 1);
    expect(steps).toBeLessThanOrEqual(Math.ceil(clock.pace));
    expect(clock.state.time).toBe(steps);
    clock.speed = 4;
    steps = 0;
    for (let frame = 0; frame < 60; frame++) steps += clock.run(1000 / 60);
    expect(steps).toBeGreaterThanOrEqual(Math.floor(4 * clock.pace) - 1);
    expect(steps).toBeLessThanOrEqual(Math.ceil(4 * clock.pace) + 1);
  });

  it('takes about fifteen seconds a lap at 1x, at any circuit', () => {
    for (const [season, round] of [[2018, 4], [2019, 9], [2023, 8]] as const) {
      const clock = new RaceClock(quickRace(season, round, 3).race);
      clock.speed = 1;
      // Run five real minutes of racing, then measure the leader's laps.
      for (let frame = 0; frame < 60 * 60 * 5 && clock.state.phase !== 'finished'; frame++) clock.run(1000 / 60);
      const leader = clock.state.cars.reduce((best, car) => (car.pos > best.pos ? car : best));
      const perLap = 300 / leader.pos;
      expect(perLap, `${season} round ${round}`).toBeGreaterThan(LAP_ON_SCREEN * 0.85);
      expect(perLap, `${season} round ${round}`).toBeLessThan(LAP_ON_SCREEN * 1.25);
    }
  });

  it('slows down, and holds still, for a moment worth watching', () => {
    const clock = fresh();
    clock.speed = 1;
    clock.slow = 0.25;
    let steps = 0;
    for (let frame = 0; frame < 240; frame++) steps += clock.run(1000 / 60);
    // Four real seconds at a quarter of 1x: one second's worth of racing at 1x.
    expect(steps).toBeGreaterThanOrEqual(Math.floor(clock.pace) - 1);
    expect(steps).toBeLessThanOrEqual(Math.ceil(clock.pace) + 1);
    clock.slow = 0;
    expect(clock.run(100)).toBe(0);
  });

  it('does not try to catch up after a stall', () => {
    const clock = fresh();
    clock.speed = 1;
    // A minute's stall counts as a tenth of a second: at most one step.
    expect(clock.run(60_000)).toBeLessThanOrEqual(1);
    expect(clock.state.time).toBeLessThanOrEqual(1);
  });

  it('shows each car between where it was and where it is', () => {
    const clock = fresh();
    clock.speed = 1;
    for (let frame = 0; frame < 600; frame++) clock.run(1000 / 60);
    const car = clock.state.cars.find((candidate) => candidate.status === 'running')!;
    const shown = clock.shown(car.entrant);
    expect(shown).toBeLessThanOrEqual(car.pos);
    expect(shown).toBeGreaterThan(car.pos - 0.02);
  });

  it('skips to the end with every car in the pit wall\'s hands', () => {
    const { race } = quickRace(2018, 4, 3, 'ferrari');
    const clock = new RaceClock(race);
    for (const car of race.cars) command(race, { type: 'plan', car: car.id, stops: [] });
    clock.skip();
    expect(race.phase).toBe('finished');
    expect(race.cars.every((car) => car.auto)).toBe(true);
    expect(classification(race).some((row) => row.status === 'Disqualified')).toBe(false);
  });
});

describe('a stop called by the player', () => {
  it('takes the place of the next stop in the plan', () => {
    const grid = realEntrants(2019, 3, 'ferrari');
    const race = createRace({ ...raceSetup(2019, 3, 'race', grid), weather: [] }, 5);
    const car = race.cars.find((candidate) => candidate.id === 'ferrari-1')!;
    command(race, { type: 'plan', car: car.id, start: 'medium', stops: [{ lap: 20, compound: 'hard' }, { lap: 32, compound: 'soft' }] });
    while (car.lap < 8) step(race);
    command(race, { type: 'pit', car: car.id, compound: 'hard' });
    while (car.stops === 0 && race.phase !== 'finished') step(race);
    expect(car.stops).toBe(1);
    expect(car.plan).toEqual([{ lap: 32, compound: 'soft' }]);
    // The stop that was planned and made on time leaves the rest of the plan alone.
    while (car.stops === 1 && race.phase !== 'finished' && car.status !== 'out') step(race);
    if (car.status !== 'out') expect(car.plan).toEqual([]);
  });
});

describe('the words of a race', () => {
  const { race } = quickRace(2019, 12, 2, 'ferrari');
  const at = { time: 100, lap: 3 };
  const mine = race.setup.grid.find((entrant) => entrant.player)!;
  const other = race.setup.grid.find((entrant) => !entrant.player)!;
  const say = (event: RaceEvent) => feedLine(race, event);

  it('speak for the driver, with a line for every message', () => {
    for (const message of ['tyres-going', 'tyres-gone', 'fuel-low', 'battery-empty', 'damage', 'want-inters', 'want-wets', 'want-slicks', 'stuck-behind', 'engine-worry'] as const) {
      expect(radioWords(message).length).toBeGreaterThan(10);
      const line = say({ ...at, type: 'radio', car: mine.id, message })!;
      expect(line.kind).toBe('radio');
      expect(line.who?.code).toBe(mine.code);
    }
  });

  it('follow the player\'s cars closely and the field only for what matters', () => {
    expect(say({ ...at, type: 'overtake', car: mine.id, on: other.id, position: 4, error: false })!.text).toMatch(/^Passes .+ for 4th\.$/);
    expect(say({ ...at, type: 'overtake', car: other.id, on: mine.id, position: 4, error: false })!.text).toMatch(/^Loses 4th to /);
    const [third, fourth] = race.setup.grid.filter((entrant) => !entrant.player);
    expect(say({ ...at, type: 'overtake', car: third!.id, on: fourth!.id, position: 9, error: false })).toBeNull();
    expect(say({ ...at, type: 'overtake', car: third!.id, on: fourth!.id, position: 1, error: false })!.text).toMatch(/^Takes the lead/);
    expect(say({ ...at, type: 'pit', car: other.id, compound: 'soft', stationary: 2.4 })).toBeNull();
    expect(say({ ...at, type: 'pit', car: mine.id, compound: 'soft', stationary: 2.4 })!.text).toBe(
      'Pit stop: soft tyres, 2.4 seconds standing still.',
    );
    expect(say({ ...at, type: 'safety-car', reason: 'Accident' })).toMatchObject({
      kind: 'flag',
      text: 'Safety car, for a crash. No overtaking.',
    });
    expect(say({ ...at, type: 'failure', car: other.id, cause: 'Gearbox', out: true })!.text).toBe('Retires with a gearbox failure.');
    expect(say({ ...at, type: 'failure', car: other.id, cause: 'KERS', out: true })!.text).toBe('Retires with a KERS boost failure.');
    expect(say({ ...at, type: 'failure', car: other.id, cause: 'Gearbox', out: false })).toBeNull();
    expect(say({ ...at, type: 'finish', car: other.id, position: 1 })!.text).toBe(`${other.driverName} wins.`);
  });

  it('name the battery settings of each era, and the state of the track', () => {
    expect(energyWords(sessionRules(2012, 'race'), 'overtake')).toBe('Boost');
    expect(energyWords(sessionRules(2012, 'race'), 'harvest')).toBe('Bank');
    expect(energyWords(sessionRules(2020, 'race'), 'overtake')).toBe('Overtake');
    expect([0, 0.08, 0.3, 0.8].map(trackWords)).toEqual(['Dry', 'Damp', 'Wet', 'Very wet']);
    expect(calendar(2019).length).toBe(21);
  });
});
