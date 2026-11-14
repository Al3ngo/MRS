/**
 * How many stops the pit wall plans, season by season, for an average driver on a dry day.
 * For tuning TYRE_ERAS: npm run lab:tyres
 */
import { calendar } from '../src/game/data';
import { TYRE_ERAS, options, raceSetup, realEntrants } from '../src/game/sim';

const overrides = process.argv.slice(2);
// "2018:softLife=0.4,fade=0.01" changes the era that ends in 2018.
for (const override of overrides) {
  const [until, values] = override.split(':');
  const row = TYRE_ERAS.find((candidate) => candidate.until === Number(until))!;
  for (const pair of values!.split(',')) {
    const [key, value] = pair.split('=');
    (row as unknown as Record<string, number>)[key!] = Number(value);
  }
}
for (const season of [2010, 2011, 2013, 2014, 2016, 2017, 2018, 2019, 2021, 2022, 2024, 2025, 2026]) {
  const counts = [0, 0, 0, 0];
  const shapes = new Map<string, number>();
  let total = 0;
  let margin = 0;
  for (const round of calendar(season)) {
    const grid = realEntrants(season, round.round);
    const setup = raceSetup(season, round.round, 'race', grid);
    const entrant = { ...grid[0]!, ratings: { ...grid[0]!.ratings, tyres: 85 } };
    const all = options(setup, entrant, setup.laps, { current: null, used: [], ruleApplies: true, maxStops: 3, stopCost: setup.traits.pitLoss + 1 });
    const best = all[0]!;
    counts[best.stops.length]! += 1;
    total += best.stops.length;
    const shape = [best.first, ...best.stops.map((stop) => stop.compound)].map((id) => id[0]!.toUpperCase()).join('');
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
    const other = all.find((option) => option.stops.length !== best.stops.length);
    if (other) margin += other.cost - best.cost;
  }
  const rounds = calendar(season).length;
  console.log(
    `${season}: ${(total / rounds).toFixed(2)} stops planned  [0/1/2/3: ${counts.join('/')}]  next-best stop count ${(margin / rounds).toFixed(1)}s behind  ` +
      [...shapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([shape, count]) => `${shape}×${count}`).join(' '),
  );
}
