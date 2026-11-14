/**
 * Save versions. A save records the SCHEMA_VERSION it was written with; loading an older one runs
 * it through the migrations below, one version at a time, before it is checked and used.
 */
import { emptyWeekend, findProblems, summarise, type CareerState, type CareerSummary } from './career';

/** Bump when CareerState changes shape, and add `MIGRATIONS[oldVersion]`. */
export const SCHEMA_VERSION = 2;

/** `MIGRATIONS[n]` turns a version n career into a version n + 1 career. */
export type Migrations = Readonly<Record<number, (older: unknown) => unknown>>;
export const MIGRATIONS: Migrations = {
  /**
   * Version 1 (Stages 1 to 4) was a stand-in career: a counter of sessions with no team and no
   * results. It keeps its identity, start date and season, starts that season from round 1, and
   * asks for a team when it is next opened.
   */
  1: (older) => {
    const career = older as Record<string, unknown>;
    return {
      ...career,
      team: null,
      round: 1,
      phase: 'practice',
      finished: false,
      weekend: emptyWeekend(),
      results: [],
      history: [],
    };
  },
};

export type SaveErrorCode =
  /** The file is not JSON at all. */
  | 'not-json'
  /** JSON, but not one of this game's saves. */
  | 'not-a-save'
  /** Written by a newer version of the game than this one. */
  | 'too-new'
  /** Older than the oldest version this build can still upgrade. */
  | 'too-old'
  /** Readable, but the career inside is damaged. */
  | 'invalid'
  /** The slot holds nothing to load. */
  | 'missing'
  /** The browser's storage refused or failed. */
  | 'storage';

export class SaveError extends Error {
  override readonly name = 'SaveError';
  constructor(
    readonly code: SaveErrorCode,
    message: string,
    /** For 'invalid': each problem found, in plain words. */
    readonly problems: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Runs the migration steps from one version to another. Exposed with a table for testing. */
export function migrate(career: unknown, from: number, to: number, table: Migrations): unknown {
  if (!Number.isInteger(from) || from < 1) {
    throw new SaveError('not-a-save', 'The save does not say which version wrote it.');
  }
  if (from > to) {
    throw new SaveError('too-new', 'This save was made by a newer version of the game.');
  }
  let current = career;
  for (let version = from; version < to; version++) {
    const step = table[version];
    if (!step) {
      throw new SaveError('too-old', `This save is from version ${from}, which this build can no longer upgrade.`);
    }
    current = step(current);
  }
  return current;
}

/** Brings a stored career up to the current version and checks it. Throws SaveError. */
export function upgradeCareer(career: unknown, fromVersion: number): CareerState {
  const upgraded = migrate(career, fromVersion, SCHEMA_VERSION, MIGRATIONS);
  const problems = findProblems(upgraded);
  if (problems.length > 0) {
    throw new SaveError('invalid', 'The career in this save is damaged.', problems);
  }
  return upgraded as CareerState;
}

/**
 * Everything the storage layer needs to know about careers: which version it writes, how to bring
 * an older one up to date, how to check one, and what to show for one in the slot list. Storage
 * works only through this, so it can be tested against save versions that do not exist yet.
 */
export interface SaveCodec {
  /** The save version this build writes. */
  readonly version: number;
  /** Brings a stored career from `fromVersion` up to `version` and checks it. Throws SaveError. */
  upgrade(career: unknown, fromVersion: number): CareerState;
  findProblems(career: unknown): string[];
  summarise(career: CareerState): CareerSummary;
}

export const gameCodec: SaveCodec = {
  version: SCHEMA_VERSION,
  upgrade: upgradeCareer,
  findProblems,
  summarise,
};
