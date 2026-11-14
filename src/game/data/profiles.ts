/**
 * The game's own view of teams, engine makers and circuits.
 *
 * ASSESSMENTS, not facts: colours chosen to read on a black screen, money on the game's small
 * abstract scale, and circuit character on 1 to 5 scales. Balance values, tuned as the game is played.
 */

// ── Team colours ────────────────────────────────────────────────────────────────────────────

/**
 * One colour per team per period, for car markers and timing bars. Picked to recall the real car
 * and, above all, to be told apart from every other team on the grid that season (a test checks
 * this). `from` is the first season the colour applies; it lasts until the team's next entry.
 */
const COLOURS: Readonly<Record<string, readonly (readonly [from: number, colour: string])[]>> = {
  ferrari: [[2010, '#e0312b']],
  mclaren: [[2010, '#9aa3ad'], [2015, '#6f757d'], [2017, '#ff8a1c']],
  mercedes: [[2010, '#2ed3bd']],
  'red-bull': [[2010, '#3f5fe0']],
  williams: [[2010, '#9fc3f2'], [2015, '#eef2f7'], [2019, '#58a8f5']],
  renault: [[2010, '#f6cf2f'], [2011, '#c6a14b'], [2016, '#f2a900'], [2021, '#ee6fb0']],
  'force-india': [[2010, '#f38a36'], [2017, '#f6a3cf'], [2021, '#2c9c7c']],
  'toro-rosso': [[2010, '#5f7399'], [2024, '#7f9bff'], [2025, '#b4dcff']],
  sauber: [[2010, '#f2f2f2'], [2015, '#f2e24a'], [2018, '#a9333d'], [2024, '#5ee35c'], [2026, '#8c9199']],
  'lotus-racing': [[2010, '#3f9a58']],
  virgin: [[2010, '#b3264f'], [2016, '#39a7d9']],
  hrt: [[2010, '#6f747c']],
  haas: [[2016, '#a4a9b0'], [2019, '#b79b55'], [2020, '#f3f3f3']],
  cadillac: [[2026, '#f5d98a']],
};

export function teamColour(team: string, season: number): string {
  const periods = COLOURS[team];
  if (!periods) throw new RangeError(`No colour for team ${team}`);
  let colour = periods[0]![1];
  for (const [from, value] of periods) if (season >= from) colour = value;
  return colour;
}

/** Names the game shows in place of the constructor's name for a season. */
const TEAM_NAMES: Readonly<Record<string, string>> = {
  'lotus-racing 2011': 'Team Lotus',
  'virgin 2011': 'Marussia Virgin',
  'marussia 2015': 'Manor Marussia',
  'sauber 2010': 'BMW Sauber',
};

export const shownTeamName = (constructor: string, season: number, name: string): string =>
  TEAM_NAMES[`${constructor} ${season}`] ?? name;

// ── Money ───────────────────────────────────────────────────────────────────────────────────

/**
 * What a team can spend on its cars in a season, in game money, before any cap. The scale is the
 * brief's: the 2021 cap is 145. Four periods: 2010-13, 2014-16, 2017-20, 2021 on.
 */
const SPENDING: Readonly<Record<string, readonly [number, number, number, number]>> = {
  ferrari: [210, 220, 230, 240],
  mclaren: [200, 190, 170, 200],
  'red-bull': [195, 210, 225, 240],
  mercedes: [170, 215, 235, 240],
  renault: [130, 110, 150, 150],
  williams: [105, 115, 105, 120],
  'force-india': [85, 90, 105, 180],
  sauber: [90, 80, 90, 115],
  'toro-rosso': [80, 90, 100, 130],
  'lotus-racing': [55, 60, 60, 60],
  virgin: [50, 50, 50, 50],
  hrt: [40, 40, 40, 40],
  haas: [90, 90, 90, 110],
  cadillac: [135, 135, 135, 135],
};

/** A team's spending power in a season, before the budget cap is applied. */
export function teamSpending(team: string, season: number): number {
  const periods = SPENDING[team];
  if (!periods) throw new RangeError(`No spending figure for team ${team}`);
  const period = season <= 2013 ? 0 : season <= 2016 ? 1 : season <= 2020 ? 2 : 3;
  let value = periods[period];
  // Late investment: Williams under new owners, Haas with a works partner, Sauber becoming Audi.
  if (team === 'williams' && season >= 2024) value = 135;
  if (team === 'haas' && season >= 2024) value = 125;
  if (team === 'sauber' && season >= 2026) value = 150;
  return value;
}

// ── Engine makers ───────────────────────────────────────────────────────────────────────────

/**
 * The engine programme behind each badge. A rebadged engine (TAG Heuer for Renault, the Red Bull
 * names for Honda) is the same engine with a different name on it.
 */
const ENGINE_FAMILIES: Readonly<Record<string, string>> = {
  'tag-heuer': 'renault',
  'toro-rosso': 'renault',
  'bwt-mercedes': 'mercedes',
  rbpt: 'honda',
  'honda-rbpt': 'honda',
};

export const engineFamily = (badge: string): string => ENGINE_FAMILIES[badge] ?? badge;

export interface EngineMaker {
  id: string;
  name: string;
  /** Seasons it supplies engines. */
  seasons: readonly [number, number];
  /** How good it is in its first season in the game, 0 to 100. Development moves these afterwards. */
  power: number;
  reliability: number;
  drivability: number;
}

export const ENGINE_MAKERS: readonly EngineMaker[] = [
  { id: 'mercedes', name: 'Mercedes', seasons: [2010, 2026], power: 92, reliability: 90, drivability: 88 },
  { id: 'ferrari', name: 'Ferrari', seasons: [2010, 2026], power: 90, reliability: 88, drivability: 86 },
  { id: 'renault', name: 'Renault', seasons: [2010, 2025], power: 86, reliability: 86, drivability: 92 },
  { id: 'cosworth', name: 'Cosworth', seasons: [2010, 2013], power: 85, reliability: 78, drivability: 78 },
  { id: 'honda', name: 'Honda', seasons: [2015, 2026], power: 72, reliability: 60, drivability: 70 },
  { id: 'red-bull-ford', name: 'Red Bull Ford', seasons: [2026, 2026], power: 86, reliability: 84, drivability: 84 },
  { id: 'audi', name: 'Audi', seasons: [2026, 2026], power: 82, reliability: 80, drivability: 80 },
];

// ── Circuits ────────────────────────────────────────────────────────────────────────────────

export interface CircuitTraits {
  /** How much engine power matters, 1 to 5. */
  power: number;
  /** How much downforce matters, 1 to 5. */
  downforce: number;
  /** How hard the circuit is on tyres, 1 to 5. */
  tyreWear: number;
  /** How easy overtaking is, 1 (a procession) to 5. */
  overtaking: number;
  /** Chance of a safety car in a race, 0 to 1. */
  safetyCar: number;
  /** Chance of rain during a race, 0 to 1. */
  rain: number;
  /** Seconds lost by a pit stop, pit lane included. */
  pitLoss: number;
  /** How unforgiving the circuit is of an accident, 1 to 5: walls close by, speeds high. */
  danger: number;
}

/** power, downforce, tyreWear, overtaking, safetyCar, rain, pitLoss, danger */
const TRAITS: Readonly<Record<string, readonly [number, number, number, number, number, number, number, number]>> = {
  austin: [3, 4, 4, 4, 0.3, 0.15, 20, 2],
  bahrain: [4, 3, 5, 5, 0.35, 0.01, 23, 2],
  baku: [5, 2, 2, 5, 0.55, 0.05, 20, 4],
  buddh: [3, 4, 3, 3, 0.15, 0.02, 21, 2],
  catalunya: [3, 5, 4, 2, 0.25, 0.1, 22, 2],
  hockenheimring: [4, 3, 3, 4, 0.4, 0.25, 18, 2],
  hungaroring: [1, 5, 3, 1, 0.25, 0.2, 21, 2],
  imola: [3, 4, 2, 1, 0.45, 0.25, 28, 3],
  interlagos: [3, 4, 3, 5, 0.55, 0.35, 21, 3],
  istanbul: [3, 4, 4, 4, 0.3, 0.2, 20, 2],
  jeddah: [5, 2, 2, 4, 0.75, 0.01, 20, 5],
  'las-vegas': [5, 1, 2, 5, 0.45, 0.03, 21, 4],
  lusail: [3, 5, 5, 3, 0.3, 0.01, 25, 2],
  madring: [3, 4, 3, 3, 0.4, 0.1, 22, 3],
  'marina-bay': [1, 5, 3, 2, 0.9, 0.25, 28, 3],
  melbourne: [3, 4, 2, 2, 0.6, 0.2, 21, 3],
  'mexico-city': [4, 5, 2, 3, 0.35, 0.15, 22, 2],
  miami: [4, 3, 3, 4, 0.45, 0.25, 20, 3],
  monaco: [1, 5, 1, 1, 0.55, 0.2, 20, 3],
  montreal: [4, 2, 2, 4, 0.6, 0.3, 18, 3],
  monza: [5, 1, 2, 4, 0.35, 0.2, 24, 4],
  mugello: [3, 5, 4, 2, 0.5, 0.15, 21, 3],
  nurburgring: [3, 4, 3, 3, 0.35, 0.35, 20, 2],
  'paul-ricard': [3, 4, 3, 2, 0.2, 0.1, 26, 1],
  portimao: [3, 4, 2, 3, 0.25, 0.15, 22, 2],
  sepang: [4, 4, 5, 4, 0.3, 0.45, 22, 2],
  shanghai: [4, 3, 4, 4, 0.4, 0.25, 22, 2],
  silverstone: [4, 5, 5, 4, 0.4, 0.3, 21, 4],
  sirius: [4, 3, 1, 2, 0.5, 0.1, 25, 3],
  'spa-francorchamps': [5, 3, 4, 5, 0.45, 0.45, 20, 5],
  spielberg: [4, 2, 3, 5, 0.4, 0.3, 20, 2],
  suzuka: [3, 5, 4, 2, 0.4, 0.3, 22, 4],
  valencia: [3, 3, 3, 2, 0.35, 0.03, 20, 3],
  'yas-marina': [3, 4, 2, 3, 0.25, 0.01, 22, 2],
  yeongam: [3, 4, 3, 3, 0.5, 0.3, 21, 2],
  zandvoort: [2, 5, 3, 1, 0.4, 0.3, 21, 3],
};

export function circuitTraits(circuit: string): CircuitTraits {
  const row = TRAITS[circuit];
  if (!row) throw new RangeError(`No traits for circuit ${circuit}`);
  const [power, downforce, tyreWear, overtaking, safetyCar, rain, pitLoss, danger] = row;
  return { power, downforce, tyreWear, overtaking, safetyCar, rain, pitLoss, danger };
}

export const CIRCUITS_WITH_TRAITS: readonly string[] = Object.keys(TRAITS);
export const TEAMS_WITH_COLOURS: readonly string[] = Object.keys(COLOURS);
