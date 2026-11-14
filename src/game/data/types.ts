/**
 * The shape of the game's reference data.
 *
 * Two kinds of data live side by side and are kept apart on purpose:
 *
 *   FACTS       what really happened in 2010 to 2026: calendars, circuits, entries, drivers.
 *               Generated from open data (see scripts/generate-data.mjs) and never edited by hand.
 *   ASSESSMENTS the game's own judgement: driver ratings, team strength, circuit character.
 *               Written by hand, and tuned during balancing.
 *
 * A career starts from the facts of 2010 and then goes its own way. Facts about later seasons
 * (who really drove where in 2017, say) are reference, not a script the game follows.
 */

export const FIRST_SEASON = 2010;
export const LAST_SEASON = 2026;

// ── Facts ───────────────────────────────────────────────────────────────────────────────────

export type CircuitType = 'permanent' | 'street' | 'road';
export type Direction = 'clockwise' | 'anticlockwise';

export interface CircuitFact {
  id: string;
  /** Short name, as used in lists: "Silverstone". */
  name: string;
  /** "Silverstone Circuit" */
  fullName: string;
  /** Nearest place: "Silverstone". */
  place: string;
  country: string;
  /** Three-letter country code: "GBR". */
  countryCode: string;
  type: CircuitType;
  direction: Direction;
  /**
   * One lap of the circuit as x,y pairs: metres east and north of the middle of the circuit, in
   * driving order, starting at the start line. The lap closes back onto the first point.
   */
  outline: readonly number[];
  /** 'surveyed': traced from mapping data. 'sketched': drawn by hand from a track map. */
  outlineSource: 'surveyed' | 'sketched';
}

export interface RoundFact {
  /** 1-based round of the season. */
  round: number;
  /** Grand Prix id: "great-britain". */
  gp: string;
  /** "British Grand Prix" */
  name: string;
  /** Three-letter code of the Grand Prix: "GBR". */
  code: string;
  circuit: string;
  /** Race day, ISO date: "2010-07-11". */
  date: string;
  /** Laps the race is scheduled for. */
  laps: number;
  /** Lap length that year, in km. Layouts change, so this belongs to the round, not the circuit. */
  lapKm: number;
  turns: number;
  /** Laps of the sprint, on a sprint weekend; null otherwise. */
  sprintLaps: number | null;
  /**
   * The quickest dry lap of the weekend, in seconds: the yardstick the simulation's lap times are
   * built from. Normally the real quickest lap of that weekend.
   */
  refLap: number;
  /** Present when the real weekend was wet, or the round is still to come, and the lap is an estimate. */
  refLapEstimated?: boolean;
}

/** One team in one season. */
export interface EntryFact {
  /** The team's id for the whole of 2010 to 2026, whatever it was called that year. */
  team: string;
  /** Its constructor id that season: "lotus-f1". */
  constructor: string;
  /** Its name that season: "Lotus". */
  name: string;
  /** Country the team was licensed in that season. */
  countryCode: string;
  /** Engine maker, as badged that season: "tag-heuer". */
  engine: string;
  /** "TAG Heuer" */
  engineName: string;
  /** Who started races for the team that season, and in which rounds ("1-11,15-20"). */
  drivers: readonly { id: string; rounds: string }[];
}

/** A team across its changes of name. */
export interface TeamFact {
  id: string;
  /** Its constructor ids in order, with the seasons each was used (within 2010 to 2026). */
  names: readonly { constructor: string; name: string; from: number; to: number }[];
  /** First and last season it raced in 2010 to 2026. */
  seasons: readonly [number, number];
}

export interface DriverFact {
  id: string;
  /** "Lewis Hamilton" */
  name: string;
  firstName: string;
  lastName: string;
  /** Timing-screen abbreviation: "HAM". */
  code: string;
  /** Date of birth, ISO. */
  born: string;
  countryCode: string;
  /** "British" */
  nationality: string;
  /** Season of the driver's first ever race start, which may be before 2010. */
  debut: number;
  /** First and last season with a race start within 2010 to 2026. */
  raced: readonly [number, number];
}

/** How a team's car really performed in a season. Reference for setting starting strengths. */
export interface RealPace {
  /** Median gap of the team's best qualifying lap to the fastest car, in percent. 0 is the fastest car. */
  gap: number;
  /** Share of race starts that ended in a mechanical retirement, 0 to 1. */
  mechanical: number;
  starts: number;
}

export interface DataSources {
  /** The F1DB release the facts were generated from. */
  f1db: string;
  /** The circuit outline set the surveyed outlines came from. */
  circuits: string;
  /** Facts for the last season run to this round; later rounds are as scheduled. */
  lastSeasonRoundsHeld: number;
}
