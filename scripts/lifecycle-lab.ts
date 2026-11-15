/**
 * The driver lifecycle in bulk. Part one: how often fatal accidents would happen, from every real
 * round of every season simulated (with a few seeds each): crashes out per season, and the expected
 * deaths per season and per career at the current fatal chance. Part two: a whole career played by
 * the game's own choices, reporting who was lost, the made-up drivers who joined, and retirements.
 *
 *   npm run lab:lifecycle -- 3
 */
import { chooseTeam, newCareer, type CareerState } from '../src/game/career';
import { SEASONS, calendar } from '../src/game/data';
import { autoplay } from '../src/game/season/sessions';
import { classification, quickRace, runToEnd } from '../src/game/sim';
import { fatalChance } from '../src/game/world';

const runs = Number(process.argv[2] ?? '2');
let total = 0;
console.log('season | crashes out per season | expected deaths per season');
for (const season of SEASONS) {
  let crashes = 0;
  let expected = 0;
  for (let run = 0; run < runs; run++) {
    for (const round of calendar(season)) {
      const { race } = quickRace(season, round.round, season * 1000 + round.round * 7 + run);
      runToEnd(race);
      for (const row of classification(race)) {
        if (row.status !== 'Accident' && row.status !== 'Collision') continue;
        crashes += 1;
        const entrant = race.setup.grid.find((candidate) => candidate.driver === row.driver)!;
        expected += fatalChance(season, race.setup.traits.danger, entrant.ratings.aggression);
      }
    }
  }
  total += expected / runs;
  console.log(`${season}   | ${(crashes / runs).toFixed(1).padStart(5)} | ${(expected / runs).toFixed(3)}`);
}
console.log(`expected deaths over a whole career, 2010 to 2026: ${total.toFixed(2)}`);

if (process.argv.includes('--career')) {
  let career: CareerState = chooseTeam(newCareer('lab-lifecycle', new Date('2026-01-01T00:00:00Z')), 'williams');
  while (!(career.finished && career.phase === 'management')) career = autoplay(career);
  console.log(`\nA Williams career: ${career.world.lost.length} lost, ${career.world.fictional.length} made-up drivers by 2026`);
  for (const lost of career.world.lost) console.log(`  lost: ${lost.driver} (${lost.team}), ${lost.season} ${lost.race}, lap ${lost.lap}`);
}
