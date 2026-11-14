/**
 * The rulebook, season by season. Each season's rules are a complete, self-contained object so the
 * simulation never has to ask "what year is it?": it reads the rules it is given.
 *
 * The facts here follow the real regulations. Where the brief sets a game-scale value (the budget
 * cap), the brief's number is used.
 */
import { FIRST_SEASON, LAST_SEASON } from './types';

/** How strongly a season's rule changes reshuffle the competitive order. */
export type Reset = 'none' | 'minor' | 'major';

export interface TyreCompound {
  name: string;
  /** Sidewall marking colour, as a hex colour for the race view. */
  colour: string;
}

export interface Rules {
  season: number;
  /** What the season's changes are, in a line each. Empty when the rules carried over. */
  changes: readonly string[];
  /** How much the changes shake up the order. Teams that prepared early gain from a major reset. */
  reset: Reset;

  /** 'v8': 2.4 litre V8. 'hybrid': 1.6 litre V6 turbo hybrid. 'hybrid-2026': no MGU-H, about half the power electric. */
  engine: 'v8' | 'hybrid' | 'hybrid-2026';
  /** Energy recovery the driver can deploy. 'kers' is a simple boost button; 'ers' has deployment modes. */
  recovery: 'none' | 'kers' | 'ers';
  /** The driver's overtaking aid. */
  overtakingAid: 'none' | 'drs' | 'active-aero';
  /** Complete engines (to 2013) or combustion engines (from 2014) allowed per car before grid penalties. */
  engineAllowance: number;
  /** Battery and control-electronics sets allowed per car; null before the hybrid era. */
  batteryAllowance: number | null;

  tyreSupplier: 'Bridgestone' | 'Pirelli';
  /** Dry compounds of the season, softest first. */
  dryCompounds: readonly TyreCompound[];
  /** How many of them are brought to each race. */
  compoundsPerRace: 2 | 3;
  wheelInches: 13 | 18;

  /** Wider, faster cars from 2017. */
  wideCars: boolean;
  /** Ground-effect floors, 2022 to 2025. */
  groundEffect: boolean;
  /** Cockpit protection from 2018. The fatal-accident model reads this. */
  halo: boolean;
  virtualSafetyCar: boolean;

  /** Spending limit in game money, excluding driver and top-staff salaries; null before 2021. */
  budgetCap: number | null;
  /** Whether some weekends have a sprint. */
  sprints: boolean;

  /** Points for a race finish, winner first. */
  racePoints: readonly number[];
  /** Points for a sprint finish, winner first; empty when the season has no sprints. */
  sprintPoints: readonly number[];
  /** One point for the fastest race lap, if set by a driver who finishes in the top ten. */
  fastestLapPoint: boolean;
  /** The last race of the season scores double. */
  doublePointsFinale: boolean;
  /**
   * What a race stopped early is worth.
   * 'half': half points below three-quarter distance.
   * 'scale-if-not-resumed': a sliding scale below three-quarter distance, but only when the race
   *   is stopped and never restarted (the 2022 wording).
   * 'scale': the sliding scale whenever three-quarter distance is not reached.
   */
  shortRace: 'half' | 'scale-if-not-resumed' | 'scale';
}

const STANDARD_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;

const RED = '#e5484d';
const YELLOW = '#f2c94c';
const WHITE = '#f2f2f2';
const PURPLE = '#b06ad9';
const PINK = '#f29ac0';
const SILVER = '#b9bec4';
const ORANGE = '#f08c3a';
const ICE = '#7cc7ee';
const GREEN = '#52c26a';

function dryCompounds(season: number): readonly TyreCompound[] {
  if (season === 2010) {
    // Bridgestone marked the softer tyre of the weekend with a green stripe.
    return [
      { name: 'Super soft', colour: GREEN },
      { name: 'Soft', colour: GREEN },
      { name: 'Medium', colour: WHITE },
      { name: 'Hard', colour: WHITE },
    ];
  }
  if (season <= 2015) {
    return [
      { name: 'Supersoft', colour: RED },
      { name: 'Soft', colour: YELLOW },
      { name: 'Medium', colour: WHITE },
      { name: 'Hard', colour: season <= 2012 ? SILVER : ORANGE },
    ];
  }
  if (season <= 2017) {
    return [
      { name: 'Ultrasoft', colour: PURPLE },
      { name: 'Supersoft', colour: RED },
      { name: 'Soft', colour: YELLOW },
      { name: 'Medium', colour: WHITE },
      { name: 'Hard', colour: ORANGE },
    ];
  }
  if (season === 2018) {
    return [
      { name: 'Hypersoft', colour: PINK },
      { name: 'Ultrasoft', colour: PURPLE },
      { name: 'Supersoft', colour: RED },
      { name: 'Soft', colour: YELLOW },
      { name: 'Medium', colour: WHITE },
      { name: 'Hard', colour: ICE },
      { name: 'Superhard', colour: ORANGE },
    ];
  }
  // From 2019 every race has a Soft, a Medium and a Hard, picked from a wider range.
  return [
    { name: 'Soft', colour: RED },
    { name: 'Medium', colour: YELLOW },
    { name: 'Hard', colour: WHITE },
  ];
}

/** Wet-weather tyres, the same in every season of the game. */
export const WET_COMPOUNDS: readonly TyreCompound[] = [
  { name: 'Intermediate', colour: GREEN },
  { name: 'Wet', colour: '#4d8fe0' },
];

/** The brief's cap on the game's money scale. */
function budgetCap(season: number): number | null {
  if (season < 2021) return null;
  if (season === 2021) return 145;
  if (season === 2022) return 140;
  return 135;
}

function engineAllowance(season: number): number {
  if (season <= 2013) return 8;
  if (season === 2014 || season === 2016) return 5;
  if (season === 2015 || season === 2017) return 4;
  if (season <= 2022) return 3;
  return 4;
}

function batteryAllowance(season: number): number | null {
  if (season <= 2013) return null;
  if (season <= 2017) return engineAllowance(season);
  if (season <= 2025) return 2;
  return 3;
}

const CHANGES: Readonly<Record<number, { reset: Reset; changes: readonly string[] }>> = {
  2010: {
    reset: 'minor',
    changes: [
      'Refuelling during the race is banned: cars start with fuel for the whole distance.',
      'Points now go to the top ten, with 25 for a win.',
      '2.4 litre V8 engines, eight per car for the season. No energy recovery this year.',
    ],
  },
  2011: {
    reset: 'minor',
    changes: [
      'DRS: a flap in the rear wing that opens on the straights for a car within a second of the one ahead, to help it overtake.',
      'KERS returns: a boost button charged by energy saved when braking.',
      'Pirelli replaces Bridgestone as tyre supplier.',
    ],
  },
  2014: {
    reset: 'major',
    changes: [
      'New engines: a smaller 1.6 litre turbo with a hybrid system (electric motors and a battery) replaces the V8.',
      'Fuel is limited: 100 kg for the race, and a cap on how fast it can be used.',
      'Five of each engine part per car for the season; using more means starting further back (a grid penalty).',
      'The last race of the season scores double points (this season only).',
    ],
  },
  2015: {
    reset: 'none',
    changes: [
      'Virtual safety car: all cars slow to a set speed while a crash is cleared, without a car to follow.',
      'Double points dropped. Four engines per car for the season.',
    ],
  },
  2016: {
    reset: 'none',
    changes: ['Three types of dry tyre at each race instead of two, with a new, softer Ultrasoft.'],
  },
  2017: {
    reset: 'major',
    changes: ['Wider cars and wider tyres with far more downforce: several seconds a lap faster.'],
  },
  2018: {
    reset: 'none',
    changes: ['The halo, a strong hoop over the driver\'s head, becomes compulsory.', 'Three engines per car for the season.'],
  },
  2019: {
    reset: 'minor',
    changes: [
      'One point for the fastest lap, for a top-ten finisher.',
      'Tyres are simply Soft, Medium and Hard at every race.',
      'Simpler front wings to help cars follow.',
    ],
  },
  2021: {
    reset: 'minor',
    changes: [
      'Budget cap: a limit on what each team may spend. Driver and top-staff pay does not count towards it.',
      'Sprints: a short extra race on Saturday at some rounds.',
      'Smaller floors, to cut the grip the air gives the cars.',
    ],
  },
  2022: {
    reset: 'major',
    changes: [
      'Ground-effect cars: most of the grip comes from air flowing under the floor, so cars can follow each other closely.',
      '18-inch wheels.',
      'Sprint points for the top eight. Budget cap lowered.',
    ],
  },
  2023: {
    reset: 'none',
    changes: ['Budget cap lowered again.', 'Six sprint weekends, each with its own qualifying.', 'Four engines per car.'],
  },
  2025: {
    reset: 'none',
    changes: ['The fastest-lap point is dropped.'],
  },
  2026: {
    reset: 'major',
    changes: [
      'New engines: a simpler hybrid system, about half the power from electricity, and sustainable fuel.',
      'Wings that flatten by themselves on the straights replace DRS; a car within a second of another gets an extra electric boost.',
      'Smaller, lighter cars.',
    ],
  },
};

function build(season: number): Rules {
  const change = CHANGES[season];
  return {
    season,
    changes: change?.changes ?? [],
    reset: change?.reset ?? 'none',
    engine: season <= 2013 ? 'v8' : season <= 2025 ? 'hybrid' : 'hybrid-2026',
    recovery: season === 2010 ? 'none' : season <= 2013 ? 'kers' : 'ers',
    overtakingAid: season === 2010 ? 'none' : season <= 2025 ? 'drs' : 'active-aero',
    engineAllowance: engineAllowance(season),
    batteryAllowance: batteryAllowance(season),
    tyreSupplier: season === 2010 ? 'Bridgestone' : 'Pirelli',
    dryCompounds: dryCompounds(season),
    compoundsPerRace: season <= 2015 ? 2 : 3,
    wheelInches: season <= 2021 ? 13 : 18,
    wideCars: season >= 2017,
    groundEffect: season >= 2022 && season <= 2025,
    halo: season >= 2018,
    virtualSafetyCar: season >= 2015,
    budgetCap: budgetCap(season),
    sprints: season >= 2021,
    racePoints: STANDARD_POINTS,
    sprintPoints: season < 2021 ? [] : season === 2021 ? [3, 2, 1] : [8, 7, 6, 5, 4, 3, 2, 1],
    fastestLapPoint: season >= 2019 && season <= 2024,
    doublePointsFinale: season === 2014,
    shortRace: season <= 2021 ? 'half' : season === 2022 ? 'scale-if-not-resumed' : 'scale',
  };
}

export const RULES: Readonly<Record<number, Rules>> = Object.fromEntries(
  Array.from({ length: LAST_SEASON - FIRST_SEASON + 1 }, (_, i) => [FIRST_SEASON + i, build(FIRST_SEASON + i)]),
);

export function rulesFor(season: number): Rules {
  const rules = RULES[season];
  if (!rules) throw new RangeError(`No rules for season ${season}`);
  return rules;
}

/**
 * Knockout qualifying: how many cars drop out after the first and the second part, leaving ten for
 * the last. 24 cars lose seven each time, 22 lose six, 20 lose five.
 */
export function knockoutCuts(cars: number): readonly [number, number] {
  const each = Math.max(0, Math.ceil((cars - 10) / 2));
  return [each, Math.max(0, cars - 10 - each)];
}

// ── Points ──────────────────────────────────────────────────────────────────────────────────

/** The sliding scale for a race that does not reach three-quarter distance (2022 on). */
const SHORT_SCALES: readonly { below: number; points: readonly number[] }[] = [
  { below: 0.25, points: [6, 4, 3, 2, 1] },
  { below: 0.5, points: [13, 10, 8, 6, 5, 4, 3, 2, 1] },
  { below: 0.75, points: [19, 14, 12, 9, 8, 6, 5, 3, 2, 1] },
];

export interface RaceOutcome {
  /** Laps the leader completed. */
  lapsCompleted: number;
  /** Laps the race was scheduled for. */
  lapsScheduled: number;
  /** Whether this is the last round of the season. */
  finale: boolean;
  /** Whether the race, having been stopped, was restarted and ran to its flag. */
  resumed: boolean;
}

/** The points table a race pays, winner first, under a season's rules. */
export function racePointsTable(rules: Rules, outcome: RaceOutcome): readonly number[] {
  const share = outcome.lapsCompleted / outcome.lapsScheduled;
  let table: readonly number[] = rules.racePoints;

  // No points at all unless the leader has run more than two laps.
  if (outcome.lapsCompleted <= 2) return [];
  if (share < 0.75) {
    if (rules.shortRace === 'half') table = table.map((points) => points / 2);
    else if (rules.shortRace === 'scale' || !outcome.resumed) {
      table = SHORT_SCALES.find((scale) => share < scale.below)?.points ?? table;
    }
  }
  if (rules.doublePointsFinale && outcome.finale) table = table.map((points) => points * 2);
  return table;
}

/** Whether the fastest-lap point is on offer in this race: full points races only. */
export function fastestLapPointOffered(rules: Rules, outcome: RaceOutcome): boolean {
  return rules.fastestLapPoint && racePointsTable(rules, outcome) === rules.racePoints;
}
