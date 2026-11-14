/**
 * The balance lab: runs real rounds many times over and prints what the races looked like.
 * For tuning the simulation, not part of the game.
 *
 *   npm run lab -- 2010 2014 2022      seasons to run (default: a spread of eras)
 *   npm run lab -- --runs 5 2019       races per round (default 3)
 *   npm run lab -- --race 2012 8 7     one race in detail: season, round, seed
 */
import { REAL_PACE, calendar, driver } from '../src/game/data';
import { classification, quickRace, runToEnd, type RaceState } from '../src/game/sim';

const args = process.argv.slice(2);
const take = (flag: string): string[] | null => {
  const at = args.indexOf(flag);
  if (at < 0) return null;
  const rest = args.splice(at);
  return rest.slice(1);
};

const clock = (seconds: number): string => {
  const whole = Math.floor(seconds / 60);
  return `${whole}:${(seconds - whole * 60).toFixed(3).padStart(6, '0')}`;
};

function showRace(season: number, round: number, seed: number): void {
  const { qualifying, race } = quickRace(season, round, seed);
  const setup = race.setup;
  console.log(`${season} ${setup.name}, ${setup.laps} laps, reference lap ${clock(setup.refLap)}`);
  console.log(`tyres: ${setup.compounds.map((tyre) => `${tyre.name} (${tyre.life.toFixed(0)} laps)`).join(', ')}`);
  console.log(`rain: ${race.rain.map((spell) => `${Math.round(spell.from)}-${Math.round(spell.to)}s at ${spell.intensity.toFixed(2)}`).join('; ') || 'none'}; track at start ${race.wetness.toFixed(2)}`);
  console.log(`pole: ${qualifying.parts[2]!.laps[0]!.car} ${clock(qualifying.parts[2]!.laps[0]!.time)}`);
  console.log(`plans: ${race.cars.slice(0, 6).map((car) => `${car.id} ${car.tyre}${car.plan.map((stop) => ` >${stop.lap} ${stop.compound}`).join('')}`).join(' | ')}`);
  runToEnd(race);
  for (const event of race.events) {
    if (event.type === 'overtake' || event.type === 'pit' || event.type === 'finish' || event.type === 'fastest-lap' || event.type === 'mistake') continue;
    console.log(`  lap ${event.lap} ${JSON.stringify({ ...event, time: undefined, lap: undefined })}`);
  }
  for (const row of classification(race)) {
    const car = race.cars.find((candidate) => candidate.id === row.car)!;
    console.log(
      `${String(row.position).padStart(2)} ${driver(row.driver).code} ${row.team.padEnd(13)} grid ${String(row.grid).padStart(2)} ` +
        `${row.time === null ? row.status.padEnd(10) : clock(row.time).padEnd(10)} stops ${row.stops} ${car.usedCompounds.join('/').padEnd(28)} ` +
        `best ${row.bestLap ? clock(row.bestLap) : '-'} pts ${row.points}`,
    );
  }
  const overtakes = race.events.filter((event) => event.type === 'overtake').length;
  console.log(`overtakes ${overtakes}, race time ${clock(race.time)}, fastest ${race.fastestLap ? clock(race.fastestLap.lapTime) : '-'}`);
}

interface Tally {
  races: number;
  starters: number;
  accidents: number;
  collisions: number;
  mechanical: number;
  fuel: number;
  disqualified: number;
  overtakes: number;
  stops: number;
  finishers: number;
  safetyCarRaces: number;
  safetyCars: number;
  expectedSafetyCars: number;
  virtual: number;
  redFlags: number;
  abandoned: number;
  timedOut: number;
  wet: number;
  poleWins: number;
  winnerGrid: number;
  frontRowWins: number;
  lapped: number;
  margin: number;
  fastestRatio: number;
  seconds: number;
  topTeam: Map<string, number>;
  dryStops: number;
  dryFinishers: number;
  dryOvertakes: number;
  dryRaces: number;
  stopCounts: number[];
}

function runSeason(season: number, runs: number): Tally {
  const tally: Tally = {
    races: 0, starters: 0, accidents: 0, collisions: 0, mechanical: 0, fuel: 0, disqualified: 0, overtakes: 0, stops: 0,
    finishers: 0, safetyCarRaces: 0, safetyCars: 0, expectedSafetyCars: 0, virtual: 0, redFlags: 0, abandoned: 0, timedOut: 0,
    wet: 0, poleWins: 0, winnerGrid: 0, frontRowWins: 0, lapped: 0, margin: 0, fastestRatio: 0, seconds: 0,
    topTeam: new Map(), stopCounts: [0, 0, 0, 0, 0], dryStops: 0, dryFinishers: 0, dryOvertakes: 0, dryRaces: 0,
  };
  for (const round of calendar(season)) {
    for (let run = 0; run < runs; run++) {
      const { race } = quickRace(season, round.round, season * 1000 + round.round * 10 + run);
      let state: RaceState = race;
      // Save and reload half way, as a phone would: the race must not notice.
      for (let i = 0; i < 2000 && state.phase !== 'finished'; i++) {
        runStep(state);
      }
      state = JSON.parse(JSON.stringify(state)) as RaceState;
      runToEnd(state);
      const rows = classification(state);
      tally.races += 1;
      tally.starters += rows.length;
      tally.expectedSafetyCars += state.setup.traits.safetyCar;
      let safetyCars = 0;
      for (const event of state.events) {
        if (event.type === 'overtake') tally.overtakes += 1;
        else if (event.type === 'safety-car') safetyCars += 1;
        else if (event.type === 'virtual-safety-car') tally.virtual += 1;
      }
      tally.safetyCars += safetyCars;
      if (safetyCars > 0) tally.safetyCarRaces += 1;
      tally.redFlags += state.redFlags;
      if (state.abandoned) tally.abandoned += 1;
      else if (state.endedEarly) tally.timedOut += 1;
      if (state.declaredWet) tally.wet += 1;
      else {
        tally.dryRaces += 1;
        // As the record counts them: fought for, and not on the first lap.
        tally.dryOvertakes += state.events.filter((event) => event.type === 'overtake' && !event.error && event.lap > 1).length;
      }
      for (const row of rows) {
        const car = state.cars.find((candidate) => candidate.id === row.car)!;
        if (row.status === 'Accident') tally.accidents += 1;
        else if (row.status === 'Collision') tally.collisions += 1;
        else if (row.status === 'Out of fuel') tally.fuel += 1;
        else if (row.status === 'Disqualified') tally.disqualified += 1;
        else if (car.status === 'out') tally.mechanical += 1;
        else {
          tally.finishers += 1;
          tally.stops += row.stops;
          if (!state.declaredWet) {
            tally.dryStops += row.stops;
            tally.dryFinishers += 1;
          }
          tally.stopCounts[Math.min(4, row.stops)]! += 1;
          if (row.laps < rows[0]!.laps) tally.lapped += 1;
        }
      }
      const winner = rows[0]!;
      tally.winnerGrid += winner.grid;
      if (winner.grid === 1) tally.poleWins += 1;
      if (winner.grid <= 2) tally.frontRowWins += 1;
      tally.topTeam.set(winner.team, (tally.topTeam.get(winner.team) ?? 0) + 1);
      if (rows[1]?.time != null && winner.time != null) tally.margin += rows[1].time - winner.time;
      if (state.fastestLap) tally.fastestRatio += state.fastestLap.lapTime / state.setup.refLap;
      tally.seconds += state.time;
    }
  }
  return tally;
}

import { step as runStep } from '../src/game/sim';

const single = take('--race');
if (single) {
  showRace(Number(single[0]), Number(single[1]), Number(single[2] ?? 1));
} else {
  const runsArg = args.indexOf('--runs');
  const runs = runsArg >= 0 ? Number(args.splice(runsArg, 2)[1]) : 3;
  const seasons = args.length > 0 ? args.map(Number) : [2010, 2012, 2014, 2017, 2019, 2022, 2025, 2026];
  const per = (value: number, races: number): string => (value / races).toFixed(2);
  console.log(
    'season races | dry: overtakes stops/car | per race: overtakes stops/car accid coll mech fuel dsq finish% lapped | SC races (expected) SCs VSCs red aband timed | wet% | pole% frontrow% grid margin | fastest/ref time | stops 0/1/2/3/4+ | wins',
  );
  for (const season of seasons) {
    const started = Date.now();
    const t = runSeason(season, runs);
    const wins = [...t.topTeam.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([team, count]) => `${team} ${Math.round((count / t.races) * 100)}%`).join(', ');
    const finishers = t.finishers;
    const real = Object.values(REAL_PACE[season] ?? {});
    const realMechanical = real.reduce((sum, team) => sum + team.mechanical * team.starts, 0) / calendar(season).length;
    console.log(
      `${season} ${String(t.races).padStart(3)} | ${per(t.dryOvertakes, t.dryRaces).padStart(6)} ${per(t.dryStops, t.dryFinishers)} | ${per(t.overtakes, t.races).padStart(6)} ${per(t.stops, finishers)} ` +
        `${per(t.accidents, t.races)} ${per(t.collisions, t.races)} ${per(t.mechanical, t.races)}(real ${realMechanical.toFixed(2)}) ${per(t.fuel, t.races)} ${per(t.disqualified, t.races)} ` +
        `${Math.round((finishers / t.starters) * 100)}% ${per(t.lapped, t.races)} | ` +
        `${Math.round((t.safetyCarRaces / t.races) * 100)}% (${Math.round((t.expectedSafetyCars / t.races) * 100)}%) ${per(t.safetyCars, t.races)} ${per(t.virtual, t.races)} ` +
        `${per(t.redFlags, t.races)} ${per(t.abandoned, t.races)} ${per(t.timedOut, t.races)} | ${Math.round((t.wet / t.races) * 100)}% | ` +
        `${Math.round((t.poleWins / t.races) * 100)}% ${Math.round((t.frontRowWins / t.races) * 100)}% ${per(t.winnerGrid, t.races)} ${per(t.margin, t.races)}s | ` +
        `${(t.fastestRatio / t.races).toFixed(4)} ${clock(t.seconds / t.races)} | ${t.stopCounts.map((count) => Math.round((count / finishers) * 100)).join('/')} | ${wins} ` +
        `[${((Date.now() - started) / 1000).toFixed(1)}s]`,
    );
  }
}
