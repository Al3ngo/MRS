/**
 * Team styles in the balance lab: one team runs whole seasons under each style in turn, against
 * the field as it is. A style should change how a team races, not simply make it win.
 *
 *   npm run lab:styles -- 2019 ferrari 3
 */
import { calendar } from '../src/game/data';
import { classification, createRace, gridOrder, qualifyingFor, raceSetup, realEntrants, runPart, seedFrom, step, type TeamStyle } from '../src/game/sim';

const [seasonArg = '2019', team = 'ferrari', runsArg = '3'] = process.argv.slice(2);
const season = Number(seasonArg);
const runs = Number(runsArg);
console.log(`${season}, ${team}: ${calendar(season).length} rounds × ${runs} runs, both cars run by the pit wall`);
console.log('style       | grid | finish | points/race | crashes per car-race | stops | laps on all-out | stress');
for (const style of ['cautious', 'balanced', 'aggressive'] as TeamStyle[]) {
  let grid = 0, finish = 0, points = 0, crashes = 0, stops = 0, cars = 0, races = 0, allOut = 0, stress = 0, samples = 0;
  for (const round of calendar(season)) {
    for (let run = 0; run < runs; run++) {
      const seed = seedFrom('style-lab', season, round.round, run);
      const entrants = realEntrants(season, round.round, undefined, seed).map((entrant) => (entrant.team === team ? { ...entrant, style } : entrant));
      const qualifying = qualifyingFor(season, round.round, entrants, seed);
      while (qualifying.part !== 4) runPart(qualifying);
      const byId = new Map(entrants.map((entrant) => [entrant.id, entrant]));
      const race = createRace(raceSetup(season, round.round, 'race', gridOrder(qualifying).map((id) => byId.get(id)!)), seedFrom(seed, 'race'));
      races += 1;
      const ours = race.cars.filter((car) => race.setup.grid[car.entrant]!.team === team);
      while (race.phase !== 'finished') {
        const before = race.time;
        step(race);
        for (const car of ours) {
          if (car.status !== 'running') continue;
          if (car.push === 'all-out') allOut += car.rate * (race.time - before);
          stress += car.stress;
          samples += 1;
        }
      }
      for (const row of classification(race)) {
        if (row.team !== team) continue;
        cars += 1;
        grid += row.grid;
        finish += row.position;
        points += row.points;
        stops += row.stops;
        if (row.status === 'Accident' || row.status === 'Collision') crashes += 1;
      }
    }
  }
  console.log(
    `${style.padEnd(11)} | ${(grid / cars).toFixed(1).padStart(4)} | ${(finish / cars).toFixed(2).padStart(6)} | ${(points / races).toFixed(1).padStart(11)} | ${(crashes / cars).toFixed(3).padStart(20)} | ${(stops / cars).toFixed(2)} | ${(allOut / cars).toFixed(2).padStart(15)} | ${(stress / samples).toFixed(0).padStart(6)}`,
  );
}
