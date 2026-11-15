/**
 * Who builds the engine. A works team makes its own power unit and develops it; a customer buys
 * one from a maker each season and gets that maker's progress, paying a lease for it.
 *
 * How strong each maker's engine was, season by season, is the game's own reading of the record
 * (in car-rating points against an average engine): the Mercedes advantage from 2014, Honda's hard
 * return in 2015 to 2017, Ferrari's dip in 2020, and so on. It only matters when a customer team
 * changes supplier: the real car already carries its real engine.
 */
import { ENTRIES, engineFamily } from '../data';
import { money } from './money';

/** Works teams: the team and the engine maker are one, or the maker builds for that team first. */
export function isWorks(team: string, maker: string): boolean {
  if (team === maker) return true;
  return (
    (team === 'sauber' && maker === 'audi') ||
    (team === 'red-bull' && (maker === 'red-bull-ford' || maker === 'honda')) ||
    (team === 'mclaren' && maker === 'honda')
  );
}

/** The engine maker a team really had in a season; for a season it did not race, its last one. */
export function realEngineOf(team: string, season: number): string | null {
  for (let year = season; year >= 2010; year--) {
    const entry = ENTRIES[year]?.find((candidate) => candidate.team === team);
    if (entry) return engineFamily(entry.engine);
  }
  return null;
}

/** [power, reliability] of each maker's engine by season, against an average one. */
const STRENGTH: Readonly<Record<string, Readonly<Record<number, readonly [number, number]>>>> = {
  mercedes: {
    2010: [1, 1], 2014: [8, 2], 2015: [6, 2], 2016: [5, 2], 2017: [4, 1], 2018: [3, 1], 2019: [2, 1],
    2020: [4, 1], 2021: [2, 0], 2022: [0, 0], 2023: [1, 1], 2024: [1.5, 1], 2025: [2, 1], 2026: [3, 0],
  },
  ferrari: {
    2010: [0.5, 1], 2014: [-2, 0], 2015: [1, 1], 2016: [2, 0], 2017: [3, 0], 2019: [3, 0], 2020: [-3, 0],
    2021: [0, 0], 2022: [2, -2], 2023: [1.5, 0], 2024: [1, 0], 2025: [0.5, 0], 2026: [1, 0],
  },
  renault: {
    2010: [-0.5, 1], 2014: [-4, -5], 2015: [-3, -3], 2016: [-1, -1], 2017: [-1, -3], 2018: [-1, -2],
    2019: [0, -1], 2020: [0.5, 0], 2021: [-1, 0], 2022: [-1, -2], 2023: [-2, -1], 2024: [-2, 0],
  },
  cosworth: { 2010: [-2, -3] },
  honda: {
    2015: [-8, -8], 2016: [-5, -4], 2017: [-6, -7], 2018: [-2, -2], 2019: [1, 0], 2021: [2, 0],
    2022: [2, 1], 2024: [1, 0], 2025: [0.5, 0], 2026: [-2, -3],
  },
  'red-bull-ford': { 2026: [0, -1] },
  audi: { 2026: [-2, -2] },
};

/** A maker's engine in a season: [power, reliability] against an average engine. */
export function engineStrength(maker: string, season: number): readonly [number, number] {
  const years = STRENGTH[maker];
  if (!years) return [0, 0];
  let value: readonly [number, number] = [0, 0];
  for (let year = 2010; year <= season; year++) value = years[year] ?? value;
  return value;
}

/** Makers selling engines to customer teams in a season: those that really supplied one. */
export function customerMakers(season: number): string[] {
  const makers = new Set<string>();
  for (const entry of ENTRIES[season] ?? []) {
    const maker = engineFamily(entry.engine);
    if (!isWorks(entry.team, maker)) makers.add(maker);
  }
  return [...makers].sort();
}

/** What a customer pays a maker for a season of engines: more for a better engine. */
export const engineLease = (maker: string, season: number): number =>
  maker === 'cosworth' ? 7 : money(Math.max(6, 12 + 0.8 * engineStrength(maker, season)[0]));
