/**
 * Push levels in the balance lab: one team's two cars run whole seasons under different push
 * policies, against a field run by the pit wall. For tuning PUSH and the stress figures.
 *
 *   npm run lab:push -- 2019 ferrari
 */
import { calendar } from '../src/game/data';
import { classification, createRace, raceSetup, realEntrants, seedFrom, step, type CarState, type PushLevel, type RaceState } from '../src/game/sim';

const [seasonArg = '2019', team = 'ferrari', runsArg = '3'] = process.argv.slice(2);
const season = Number(seasonArg);
const runs = Number(runsArg);

type Policy = (state: RaceState, car: CarState) => PushLevel | null;

const POLICIES: Record<string, Policy> = {
  'pit wall': () => null,
  'normal always': () => 'normal',
  'push always': () => 'push',
  'all-out always': () => 'all-out',
  'all-out bursts': (_, car) => {
    if (car.stress > 60 || (car.push === 'conserve' && car.stress > 25)) return 'conserve';
    return car.gapAhead < 1 && car.stress < 50 ? 'all-out' : 'normal';
  },
  // All-out only to finish a pass the car is close to making, or to hold a place late on.
  'aimed bursts': (state, car) => {
    if (car.stress > 75) return 'conserve';
    const late = state.setup.laps - car.lap <= 4;
    const striking = car.gapAhead < 0.6 || (late && car.gapBehind < 0.6);
    return striking && car.stress < 45 ? 'all-out' : car.stress > 45 ? 'normal' : car.push === 'all-out' && car.gapAhead < 0.9 ? 'all-out' : 'normal';
  },
  'push stints': (_, car) => {
    if (car.stress > 60 || (car.push === 'conserve' && car.stress > 25)) return 'conserve';
    return car.gapAhead < 1.2 || car.gapBehind < 0.8 ? 'push' : 'normal';
  },
  'all-out to 90': (_, car) => (car.gapAhead < 1.2 && car.stress < 90 ? 'all-out' : car.stress > 70 ? 'conserve' : 'normal'),
};

console.log(`${season}, ${team}: ${calendar(season).length} rounds × ${runs} runs, both cars`);
console.log('policy           | avg finish | points/race | accidents+collisions per car-race | stops | avg stress | laps all-out');
for (const [name, policy] of Object.entries(POLICIES)) {
  let finish = 0, cars = 0, points = 0, crashes = 0, stops = 0, stress = 0, stressSamples = 0, allOut = 0, races = 0;
  for (const round of calendar(season)) {
    for (let run = 0; run < runs; run++) {
      const seed = seedFrom(season, round.round, run, 'push-lab');
      const entrants = realEntrants(season, round.round, team, seed);
      // The real grid order is not the point here: line up by car and driver, as qualifying would.
      const grid = [...entrants].sort((a, b) => b.car.aero + b.car.power + b.ratings.pace - (a.car.aero + a.car.power + a.ratings.pace));
      const state = createRace(raceSetup(season, round.round, 'race', grid), seed);
      const mine = state.cars.filter((car) => state.setup.grid[car.entrant]!.player);
      for (const car of mine) car.auto = true;
      races += 1;
      while (state.phase !== 'finished') {
        step(state);
        for (const car of mine) {
          if (car.status !== 'running') continue;
          const level = policy(state, car);
          if (level) car.push = level;
          stress += car.stress;
          stressSamples += 1;
          if (car.push === 'all-out') allOut += car.rate;
        }
      }
      for (const row of classification(state)) {
        if (!mine.some((car) => car.id === row.car)) continue;
        cars += 1;
        finish += row.position;
        points += row.points;
        stops += row.stops;
        if (row.status === 'Accident' || row.status === 'Collision') crashes += 1;
      }
    }
  }
  console.log(
    `${name.padEnd(16)} | ${(finish / cars).toFixed(2).padStart(10)} | ${(points / races).toFixed(1).padStart(11)} | ${(crashes / cars).toFixed(3).padStart(33)} | ${(stops / cars).toFixed(2)} | ${(stress / stressSamples).toFixed(0).padStart(10)} | ${(allOut / cars).toFixed(1)}`,
  );
}
