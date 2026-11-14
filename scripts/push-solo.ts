/**
 * The pure trade of a push level, with no traffic: one car alone, all-out for a number of laps
 * from lap 10, otherwise normal. Prints time gained against staying at normal, and how often the
 * car fails to finish. npm run lab:push-solo -- 2019 5
 */
import { createRace, raceSetup, realEntrants, seedFrom, step, type PushLevel } from '../src/game/sim';

const [seasonArg = '2019', roundArg = '5', seedsArg = '300'] = process.argv.slice(2);
const season = Number(seasonArg);
const round = Number(roundArg);
const seeds = Number(seedsArg);

const entrant = { ...realEntrants(season, round, 'ferrari')[0]!, player: true };
const setup = { ...raceSetup(season, round, 'race', [entrant]), weather: [] };

function run(burst: number, after: PushLevel, seed: number): { time: number | null } {
  const state = createRace(setup, seedFrom('solo', seed));
  const car = state.cars[0]!;
  car.auto = true;
  while (state.phase !== 'finished') {
    step(state);
    const lap = car.lap;
    car.push = lap >= 10 && lap < 10 + burst ? 'all-out' : lap >= 10 + burst && car.stress > 25 ? after : 'normal';
  }
  return { time: car.status === 'finished' ? car.finishTime : null };
}

const base: number[] = [];
let baseOut = 0;
for (let seed = 0; seed < seeds; seed++) {
  const { time } = run(0, 'normal', seed);
  if (time === null) baseOut += 1;
  base.push(time ?? NaN);
}
console.log(`${season} round ${round}, ${setup.laps} laps, ${seeds} seeds. Burst of all-out from lap 10, then recover.`);
console.log('laps all-out | recover at | time gained (s, finishers, mean)   | did not finish (normal: ' + ((baseOut / seeds) * 100).toFixed(1) + '%)');
for (const after of ['normal', 'conserve'] as const) {
  for (const burst of [1, 2, 3, 4, 6, 10, 20]) {
    const gains: number[] = [];
    let out = 0;
    for (let seed = 0; seed < seeds; seed++) {
      const { time } = run(burst, after, seed);
      if (time === null) out += 1;
      else if (!Number.isNaN(base[seed]!)) gains.push(base[seed]! - time);
    }
    const mean = gains.reduce((sum, gain) => sum + gain, 0) / gains.length;
    console.log(`${String(burst).padStart(12)} | ${after.padEnd(10)} | ${mean.toFixed(2).padStart(34)} | ${((out / seeds) * 100).toFixed(1)}%`);
  }
}
