import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import {
  chooseTeam,
  findProblems,
  newCareer,
  summarise,
  type CareerState,
  type CareerSummary,
} from '../src/game/career';
import { MIGRATIONS, SCHEMA_VERSION, SaveError, migrate, type SaveCodec } from '../src/game/save-schema';
import { autoplay } from '../src/game/season/sessions';
import { decodeSaveFile } from '../src/platform/savefile';
import { createSaveStore, type SaveStore } from '../src/platform/saves';

let databases = 0;
const open: SaveStore[] = [];

/** A store on its own fresh database, with a clock that moves one minute per save. */
function freshStore(databaseName = `test-${++databases}`, codec?: SaveCodec) {
  let minute = 0;
  const store = createSaveStore({
    appVersion: '0.1.0-test',
    databaseName,
    now: () => new Date(Date.UTC(2026, 10, 12, 18, minute++)),
    codec,
  });
  open.push(store);
  return { store, databaseName };
}

afterEach(() => {
  while (open.length) open.pop()?.close();
});

/** A career with Ferrari, `sessions` sessions in: every session played by the pit wall. */
const cache = new Map<string, CareerState>();
const career = (sessions = 0, id = 'career-1'): CareerState => {
  const key = `${id}/${sessions}`;
  let state = cache.get(key);
  if (!state) {
    state = chooseTeam(newCareer(id, new Date('2026-11-12T17:00:00Z')), 'ferrari');
    for (let i = 0; i < sessions; i++) state = autoplay(state);
    cache.set(key, state);
  }
  return structuredClone(state);
};

async function codeOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error instanceof SaveError ? error.code : error;
  }
  return 'no error';
}

describe('save slots', () => {
  it('starts with three empty slots', async () => {
    const { store } = freshStore();
    expect(await store.list()).toEqual([
      { slot: 1, kind: 'empty' },
      { slot: 2, kind: 'empty' },
      { slot: 3, kind: 'empty' },
    ]);
    expect(await codeOf(store.load(1))).toBe('missing');
    expect(await codeOf(store.exportFile(1))).toBe('missing');
  });

  it('stores a new career and shows it in the list', async () => {
    const { store } = freshStore();
    const record = await store.replace(2, career(5));
    expect(record).toMatchObject({
      slot: 2,
      careerId: 'career-1',
      schemaVersion: SCHEMA_VERSION,
      appVersion: '0.1.0-test',
      savedAt: '2026-11-12T18:00:00.000Z',
      hasSafetyCopy: false,
      summary: { seasonYear: 2010, round: 2, rounds: 19, phase: 'qualifying', racesRun: 1, finished: false },
    });
    // Bytes as stored: UTF-8, so a name like Lucía counts its accented letter twice.
    expect(record.bytes).toBe(new TextEncoder().encode(JSON.stringify(career(5))).length);

    const list = await store.list();
    expect(list.map((view) => view.kind)).toEqual(['empty', 'career', 'empty']);
    expect(list[1]).toEqual({ slot: 2, kind: 'career', record });
    expect(await store.load(2)).toEqual(career(5));
  });

  it('keeps the three slots apart', async () => {
    const { store } = freshStore();
    await store.replace(1, career(1, 'a'));
    await store.replace(2, career(2, 'b'));
    await store.replace(3, career(3, 'c'));
    await store.save(2, career(9, 'b'));
    expect((await store.load(1)).id).toBe('a');
    expect(await store.load(2)).toEqual(career(9, 'b'));
    expect((await store.load(3)).sessionsCompleted).toBe(3);

    await store.remove(2);
    expect((await store.list()).map((view) => view.kind)).toEqual(['career', 'empty', 'career']);
    expect(await codeOf(store.load(2))).toBe('missing');
    expect(await codeOf(store.restoreSafetyCopy(2))).toBe('missing');
  });

  it('survives closing and reopening the game', async () => {
    const first = freshStore();
    await first.store.replace(1, career(7));
    first.store.close();

    const second = freshStore(first.databaseName);
    expect(await second.store.load(1)).toEqual(career(7));
    expect((await second.store.list())[0]?.kind).toBe('career');
  });

  it('writes exactly what a backup file would hold', async () => {
    const { store } = freshStore();
    const withExtras = { ...career(1), scratch: undefined, note: 'kept' } as CareerState;
    await store.replace(1, withExtras);
    const loaded = (await store.load(1)) as unknown as Record<string, unknown>;
    expect('scratch' in loaded).toBe(false);
    expect(loaded.note).toBe('kept');
  });
});

describe('autosave and the safety copy', () => {
  it('keeps the snapshot before the latest one', async () => {
    const { store } = freshStore();
    expect((await store.replace(1, career(0))).hasSafetyCopy).toBe(false);
    expect((await store.save(1, career(1))).hasSafetyCopy).toBe(true);
    const third = await store.save(1, career(2));
    expect(third.savedAt).toBe('2026-11-12T18:02:00.000Z');

    expect(await store.load(1)).toEqual(career(2));
    expect(await store.restoreSafetyCopy(1)).toEqual(career(1));
    expect(await store.load(1)).toEqual(career(1));

    const [view] = await store.list();
    expect(view).toMatchObject({ kind: 'career', record: { hasSafetyCopy: false, summary: { phase: 'qualifying' } } });
    expect(await codeOf(store.restoreSafetyCopy(1))).toBe('missing');
  });

  it('drops the safety copy when a different career takes the slot', async () => {
    const { store } = freshStore();
    await store.replace(1, career(0, 'old'));
    await store.save(1, career(1, 'old'));
    await store.replace(1, career(0, 'new'));
    expect((await store.list())[0]).toMatchObject({ record: { careerId: 'new', hasSafetyCopy: false } });
    expect(await codeOf(store.restoreSafetyCopy(1))).toBe('missing');
  });

  it('never lets a damaged save push out the last sound one', async () => {
    const { store } = freshStore();
    await store.replace(1, career(0));
    await store.save(1, career(1));
    await store.save(1, career(2));

    // Two saves in a row that fail the career's own checks, as a game bug might produce.
    const broken = { ...career(3), round: 99 };
    expect(await store.save(1, broken)).toMatchObject({ summary: null, hasSafetyCopy: true });
    expect(await store.save(1, { ...broken, round: 100 })).toMatchObject({ summary: null, hasSafetyCopy: true });

    expect((await store.list())[0]?.kind).toBe('damaged');
    expect(await codeOf(store.load(1))).toBe('invalid');

    // The safety copy is the last save that was sound when the trouble started.
    expect(await store.restoreSafetyCopy(1)).toEqual(career(2));
    expect((await store.list())[0]?.kind).toBe('career');
    expect(await store.load(1)).toEqual(career(2));
  });

  it('carries on normally once saves are sound again', async () => {
    const { store } = freshStore();
    await store.replace(1, career(0));
    await store.save(1, { ...career(1), round: 99 });
    await store.save(1, career(2));
    expect((await store.list())[0]).toMatchObject({ kind: 'career', record: { hasSafetyCopy: true } });
    expect(await store.restoreSafetyCopy(1)).toEqual(career(0));
  });

  it('does not touch the slot when a career cannot be written at all', async () => {
    const { store } = freshStore();
    await store.replace(1, career(0));
    await store.save(1, career(1));
    const circular = { ...career(2) } as CareerState & { self?: unknown };
    circular.self = circular;
    await expect(store.save(1, circular)).rejects.toBeInstanceOf(SaveError);
    expect(await store.load(1)).toEqual(career(1));
    expect(await store.restoreSafetyCopy(1)).toEqual(career(0));
  });
});

describe('backup and restore', () => {
  it('exports a slot and imports it into another', async () => {
    const { store } = freshStore();
    await store.replace(1, career(11));
    const file = await store.exportFile(1);
    expect(file.name).toMatch(/^mrm-2010-r03-\d{8}-\d{4}\.json$/);

    const decoded = decodeSaveFile(file.text);
    expect(decoded.integrity).toBe('verified');
    expect(decoded.savedAt).toBe('2026-11-12T18:00:00.000Z');

    await store.replace(3, decoded.career);
    expect(await store.load(3)).toEqual(await store.load(1));
  });

  it('shows, exports and refuses to load a save from a newer version', async () => {
    const { store, databaseName } = freshStore();
    await store.replace(1, career(4));
    store.close();

    // Rewrite the slot as a future build would have left it.
    const raw = await openDB(databaseName);
    const record = await raw.get('slots', 1);
    const snapshot = await raw.get('snapshots', [1, 'current']);
    await raw.put('slots', { ...record, schemaVersion: SCHEMA_VERSION + 1 });
    await raw.put('snapshots', { ...snapshot, schemaVersion: SCHEMA_VERSION + 1, career: { shape: 'from the future' } });
    raw.close();

    const { store: reopened } = freshStore(databaseName);
    expect((await reopened.list())[0]?.kind).toBe('newer');
    expect(await codeOf(reopened.load(1))).toBe('too-new');

    const file = await reopened.exportFile(1);
    expect(JSON.parse(file.text)).toMatchObject({
      schemaVersion: SCHEMA_VERSION + 1,
      career: { shape: 'from the future' },
    });
    expect(await codeOf(Promise.resolve().then(() => decodeSaveFile(file.text)))).toBe('too-new');
  });
});

describe('a later save version', () => {
  // A stand-in for a later version of the game, one past this one, that adds a field to every career.
  const LATER = SCHEMA_VERSION + 1;
  type WithTeam = CareerState & { teamId?: unknown };
  const teamProblems = (career: unknown): string[] =>
    typeof (career as WithTeam | null)?.teamId === 'string' ? [] : ['The career has no team.'];
  const v2: SaveCodec = {
    version: LATER,
    upgrade(career, fromVersion) {
      const upgraded = migrate(career, fromVersion, LATER, {
        ...MIGRATIONS,
        [SCHEMA_VERSION]: (older) => ({ ...(older as object), teamId: 'unassigned' }),
      });
      const problems = [...findProblems(upgraded), ...teamProblems(upgraded)];
      if (problems.length > 0) throw new SaveError('invalid', 'The career in this save is damaged.', problems);
      return upgraded as CareerState;
    },
    findProblems: (career) => [...findProblems(career), ...teamProblems(career)],
    summarise: (career) => ({ ...summarise(career), team: (career as WithTeam).teamId }) as CareerSummary,
  };
  const withTeam = (state: CareerState, teamId = 'unassigned') => ({ ...state, teamId });

  it('reads an older save, describes it afresh, and leaves it untouched until the next save', async () => {
    const before = freshStore();
    await before.store.replace(1, career(5));
    before.store.close();

    const { store } = freshStore(before.databaseName, v2);
    const [view] = await store.list();
    expect(view).toMatchObject({
      kind: 'career',
      record: { schemaVersion: SCHEMA_VERSION, summary: { seasonYear: 2010, round: 2, team: 'unassigned' } },
    });
    expect(await store.load(1)).toEqual(withTeam(career(5)));

    // Looking is not writing: the stored copy is still the career as this version wrote it.
    const file = JSON.parse((await store.exportFile(1)).text);
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect('teamId' in file.career).toBe(false);
    expect(decodeSaveFile(JSON.stringify(file), v2).career).toEqual(withTeam(career(5)));
  });

  it('keeps the pre-upgrade career as the safety copy when it first saves in the new version', async () => {
    const before = freshStore();
    await before.store.replace(1, career(5));
    before.store.close();

    const { store } = freshStore(before.databaseName, v2);
    const loaded = await store.load(1);
    const record = await store.save(1, withTeam(autoplay(loaded), 'ferrari'));
    expect(record).toMatchObject({ schemaVersion: LATER, hasSafetyCopy: true, summary: { team: 'ferrari' } });
    expect(await store.load(1)).toEqual(withTeam(career(6), 'ferrari'));

    // The safety copy is the career from before the upgrade, and it still upgrades.
    expect(await store.restoreSafetyCopy(1)).toEqual(withTeam(career(5)));
    expect((await store.list())[0]).toMatchObject({ kind: 'career', record: { schemaVersion: LATER } });
  });

  it('shows an older build a newer save as off limits, without trusting its summary', async () => {
    const newer = freshStore(undefined, v2);
    await newer.store.replace(1, withTeam(career(3), 'williams'));
    newer.store.close();

    const { store } = freshStore(newer.databaseName);
    const [view] = await store.list();
    expect(view).toMatchObject({ kind: 'newer', record: { schemaVersion: LATER, summary: null } });
    expect(await codeOf(store.load(1))).toBe('too-new');
    expect((await store.exportFile(1)).name).toMatch(/^mrm-save-/);
  });

  it('marks an older save as damaged if it cannot be brought up to date', async () => {
    const before = freshStore();
    await before.store.replace(1, career(5));
    before.store.close();

    const strict: SaveCodec = {
      ...v2,
      upgrade() {
        throw new SaveError('too-old', 'This save is from a version this build can no longer upgrade.');
      },
    };
    const { store } = freshStore(before.databaseName, strict);
    expect((await store.list())[0]).toMatchObject({ kind: 'damaged', record: { summary: null } });
    expect(await codeOf(store.load(1))).toBe('too-old');
  });
});

describe('storage trouble', () => {
  it('reports a browser that refuses to store anything as a storage error', async () => {
    const real = globalThis.indexedDB;
    const refusing = {
      open() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    };
    Object.defineProperty(globalThis, 'indexedDB', { value: refusing, configurable: true, writable: true });
    try {
      const { store } = freshStore();
      expect(await codeOf(store.list())).toBe('storage');
      expect(await codeOf(store.replace(1, career()))).toBe('storage');
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: real, configurable: true, writable: true });
    }
  });

  it('recovers once storage works again', async () => {
    const real = globalThis.indexedDB;
    const { store } = freshStore();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: { open: () => { throw new Error('offline disk'); } },
      configurable: true,
      writable: true,
    });
    expect(await codeOf(store.list())).toBe('storage');
    Object.defineProperty(globalThis, 'indexedDB', { value: real, configurable: true, writable: true });
    expect((await store.list()).map((view) => view.kind)).toEqual(['empty', 'empty', 'empty']);
  });
});
