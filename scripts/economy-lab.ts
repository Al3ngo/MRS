/**
 * The team business in bulk: whole careers played with the default choices (the team spends as
 * the real team did), printing each season's place against the real team's, the money left, the
 * car's development and the budget cap. A team run this way should land near its real place.
 *
 *   npm run lab:economy -- ferrari williams hrt
 */
import { chooseTeam, newCareer, type CareerState } from '../src/game/career';
import { rulesFor } from '../src/game/data';
import { autoplay } from '../src/game/season/sessions';
import { cappedSpend, expectedPlace } from '../src/game/team';

const teams = process.argv.slice(2);
for (const team of teams.length > 0 ? teams : ['ferrari', 'williams', 'hrt']) {
  let career: CareerState = chooseTeam(newCareer(`lab-${team}`, new Date('2026-01-01T00:00:00Z')), team);
  let season = career.seasonYear;
  let last = career;
  const gaps: number[] = [];
  console.log(`\n${team}`);
  console.log('season | place (real) | money left | parts (performance against the real car) | engines | budget cap');
  while (!(career.finished && career.phase === 'management')) {
    last = career;
    career = autoplay(career);
    if (career.seasonYear === season) continue;
    const place = career.history.at(-1)!.teams.find((row) => row.id === team)?.position ?? 0;
    const real = expectedPlace(team, season);
    gaps.push(place - real);
    const outfit = last.outfit!;
    const parts = Object.entries(outfit.parts).map(([part, state]) => `${part} ${state!.perf.toFixed(1)}`).join(', ');
    const cap = rulesFor(season).budgetCap;
    console.log(
      `${season}   | ${String(place).padStart(2)} (${String(real).padStart(2)})      | ${String(outfit.money).padStart(6)}     | ${parts} | ${outfit.units.map((unit) => unit.engines).join('/')} of ${rulesFor(season).engineAllowance} | ${cap === null ? '-' : `${cappedSpend(outfit)} of ${cap}`}`,
    );
    season = career.seasonYear;
  }
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  console.log(`average place against the real team's: ${mean >= 0 ? '+' : ''}${mean.toFixed(2)} (negative is better)`);
}
