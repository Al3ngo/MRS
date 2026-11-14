/**
 * The save store: three slots in IndexedDB.
 *
 * Each slot keeps the career as it was last saved (the "current" snapshot) and, as a safety copy,
 * the last sound snapshot before it ("previous"). The safety copy is not an undo button: it is only
 * offered when the current snapshot cannot be loaded.
 *
 * A small record per slot carries what the slot list shows, so listing does not load whole careers.
 *
 * Careers themselves are opaque here. Everything version-specific goes through a SaveCodec.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CareerState, CareerSummary } from '../game/career';
import { SaveError, gameCodec, type SaveCodec } from '../game/save-schema';
import { encodeSaveFile, saveFileName } from './savefile';

export const SLOT_IDS = [1, 2, 3] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export const isSlotId = (value: unknown): value is SlotId => SLOT_IDS.includes(value as SlotId);

export interface SlotRecord {
  slot: SlotId;
  careerId: string;
  /** Save version the current snapshot was written with. */
  schemaVersion: number;
  appVersion: string;
  /** ISO timestamp of the last save. */
  savedAt: string;
  /** Size of the career as JSON, in bytes. */
  bytes: number;
  /** Null when the career cannot be read by this build, or failed its own checks. */
  summary: CareerSummary | null;
  /** Whether an earlier sound snapshot is held as a safety copy. */
  hasSafetyCopy: boolean;
}

export type SlotView =
  | { slot: SlotId; kind: 'empty' }
  | { slot: SlotId; kind: 'career'; record: SlotRecord }
  /** Saved by a newer version of the game: shown, never loaded or overwritten by accident. */
  | { slot: SlotId; kind: 'newer'; record: SlotRecord }
  /** The current snapshot fails its checks. */
  | { slot: SlotId; kind: 'damaged'; record: SlotRecord };

type SnapshotKind = 'current' | 'previous';

interface Snapshot {
  slot: SlotId;
  kind: SnapshotKind;
  schemaVersion: number;
  savedAt: string;
  /** Whether the career passed its checks when it was written. */
  sound: boolean;
  career: unknown;
}

interface Schema extends DBSchema {
  slots: { key: number; value: SlotRecord };
  snapshots: { key: [number, string]; value: Snapshot };
  /** Device-wide preferences. Unused in Stage 1; created now so later stages need no upgrade. */
  settings: { key: string; value: unknown };
}

const DATABASE_VERSION = 1;
export const DEFAULT_DATABASE_NAME = 'modern-racing-manager';

export interface SaveStoreOptions {
  /** Version of the running game, recorded in every save. */
  appVersion: string;
  databaseName?: string;
  now?: () => Date;
  /** How careers are versioned, checked and summarised. Defaults to the game's own. */
  codec?: SaveCodec;
}

export interface SaveStore {
  /** Always three entries, slot 1 first. */
  list(): Promise<SlotView[]>;
  /** Loads a slot's career, upgraded to the current save version. Throws SaveError. */
  load(slot: SlotId): Promise<CareerState>;
  /** The autosave: writes the career and keeps the snapshot it replaces as the safety copy. */
  save(slot: SlotId, career: CareerState): Promise<SlotRecord>;
  /** Puts a different career in the slot (a new game or an imported backup). Nothing of the old one is kept. */
  replace(slot: SlotId, career: CareerState): Promise<SlotRecord>;
  remove(slot: SlotId): Promise<void>;
  /** Makes the safety copy the current snapshot again and returns it. Throws SaveError. */
  restoreSafetyCopy(slot: SlotId): Promise<CareerState>;
  /** The slot's career as backup-file text, exactly as stored, with a suggested file name. */
  exportFile(slot: SlotId): Promise<{ name: string; text: string }>;
  close(): void;
}

export function createSaveStore(options: SaveStoreOptions): SaveStore {
  const name = options.databaseName ?? DEFAULT_DATABASE_NAME;
  const now = options.now ?? (() => new Date());
  const codec = options.codec ?? gameCodec;
  let connection: Promise<IDBPDatabase<Schema>> | undefined;

  function open(): Promise<IDBPDatabase<Schema>> {
    if (!connection) {
      const opening = openDB<Schema>(name, DATABASE_VERSION, {
        upgrade(db, oldVersion) {
          if (oldVersion < 1) {
            db.createObjectStore('slots', { keyPath: 'slot' });
            db.createObjectStore('snapshots', { keyPath: ['slot', 'kind'] });
            db.createObjectStore('settings');
          }
        },
        // A newer build in another tab wants to upgrade the database: step aside rather than block it.
        blocking() {
          void opening.then((db) => db.close());
          if (connection === opening) connection = undefined;
        },
        terminated() {
          if (connection === opening) connection = undefined;
        },
      });
      connection = opening;
      opening.catch(() => {
        if (connection === opening) connection = undefined;
      });
    }
    return connection;
  }

  /** Storage failures (quota, private mode, a closed database) become one kind of SaveError. */
  async function guarded<T>(work: (db: IDBPDatabase<Schema>) => Promise<T>): Promise<T> {
    try {
      return await work(await open());
    } catch (error) {
      if (error instanceof SaveError) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new SaveError('storage', `The browser's storage did not accept the request (${reason}).`, [], {
        cause: error,
      });
    }
  }

  /**
   * What is written is the career's JSON form, parsed back: exactly what a backup file would hold,
   * with nothing that only survives in memory.
   */
  function prepare(slot: SlotId, career: CareerState) {
    const json = JSON.stringify(career);
    const stored: unknown = JSON.parse(json);
    const sound = codec.findProblems(stored).length === 0;
    const savedAt = now().toISOString();
    const snapshot: Snapshot = { slot, kind: 'current', schemaVersion: codec.version, savedAt, sound, career: stored };
    const record: SlotRecord = {
      slot,
      careerId: career.id,
      schemaVersion: codec.version,
      appVersion: options.appVersion,
      savedAt,
      bytes: new TextEncoder().encode(json).length,
      summary: sound ? codec.summarise(stored as CareerState) : null,
      hasSafetyCopy: false,
    };
    return { snapshot, record };
  }

  return {
    list: () =>
      guarded(async (db) => {
        const records = await db.getAll('slots');
        const views: SlotView[] = [];
        for (const slot of SLOT_IDS) {
          const record = records.find((candidate) => candidate.slot === slot);
          if (!record) {
            views.push({ slot, kind: 'empty' });
          } else if (record.schemaVersion > codec.version) {
            // Its summary was written by a build this one knows nothing about: do not trust its shape.
            views.push({ slot, kind: 'newer', record: { ...record, summary: null } });
          } else if (record.schemaVersion < codec.version) {
            // Written by an older build, so the stored summary may be in an older shape too.
            // Read the career itself and describe it afresh. Nothing is rewritten until the next save.
            const snapshot = await db.get('snapshots', [slot, 'current']);
            try {
              const career = codec.upgrade(snapshot?.career, record.schemaVersion);
              views.push({ slot, kind: 'career', record: { ...record, summary: codec.summarise(career) } });
            } catch {
              views.push({ slot, kind: 'damaged', record: { ...record, summary: null } });
            }
          } else {
            views.push({ slot, kind: record.summary ? 'career' : 'damaged', record });
          }
        }
        return views;
      }),

    load: (slot) =>
      guarded(async (db) => {
        const snapshot = await db.get('snapshots', [slot, 'current']);
        if (!snapshot) throw new SaveError('missing', `Slot ${slot} is empty.`);
        return codec.upgrade(snapshot.career, snapshot.schemaVersion);
      }),

    save: (slot, career) =>
      guarded(async (db) => {
        // Prepared before the transaction opens: if the career cannot be written, nothing is touched.
        const { snapshot, record } = prepare(slot, career);
        const tx = db.transaction(['slots', 'snapshots'], 'readwrite', { durability: 'strict' });
        const snapshots = tx.objectStore('snapshots');
        const replaced = await snapshots.get([slot, 'current']);
        if (replaced?.sound) {
          // This is also what preserves a career from before a save-version upgrade.
          await snapshots.put({ ...replaced, kind: 'previous' });
          record.hasSafetyCopy = true;
        } else {
          // An unsound snapshot never becomes the safety copy; whatever sound copy exists stays.
          record.hasSafetyCopy = (await snapshots.getKey([slot, 'previous'])) !== undefined;
        }
        await snapshots.put(snapshot);
        await tx.objectStore('slots').put(record);
        await tx.done;
        return record;
      }),

    replace: (slot, career) =>
      guarded(async (db) => {
        const { snapshot, record } = prepare(slot, career);
        const tx = db.transaction(['slots', 'snapshots'], 'readwrite', { durability: 'strict' });
        await tx.objectStore('snapshots').delete([slot, 'previous']);
        await tx.objectStore('snapshots').put(snapshot);
        await tx.objectStore('slots').put(record);
        await tx.done;
        return record;
      }),

    remove: (slot) =>
      guarded(async (db) => {
        const tx = db.transaction(['slots', 'snapshots'], 'readwrite', { durability: 'strict' });
        await tx.objectStore('snapshots').delete([slot, 'current']);
        await tx.objectStore('snapshots').delete([slot, 'previous']);
        await tx.objectStore('slots').delete(slot);
        await tx.done;
      }),

    restoreSafetyCopy: (slot) =>
      guarded(async (db) => {
        const tx = db.transaction(['slots', 'snapshots'], 'readwrite', { durability: 'strict' });
        const snapshots = tx.objectStore('snapshots');
        const abandon = async () => {
          tx.abort();
          await tx.done.catch(() => undefined);
        };
        const copy = await snapshots.get([slot, 'previous']);
        if (!copy) {
          await abandon();
          throw new SaveError('missing', `Slot ${slot} has no safety copy.`);
        }
        let career: CareerState;
        try {
          career = codec.upgrade(copy.career, copy.schemaVersion);
        } catch (error) {
          await abandon();
          throw error;
        }
        const { snapshot, record } = prepare(slot, career);
        await snapshots.put(snapshot);
        await snapshots.delete([slot, 'previous']);
        await tx.objectStore('slots').put(record);
        await tx.done;
        return career;
      }),

    exportFile: (slot) =>
      guarded(async (db) => {
        const tx = db.transaction(['slots', 'snapshots'], 'readonly');
        const snapshot = await tx.objectStore('snapshots').get([slot, 'current']);
        const record = await tx.objectStore('slots').get(slot);
        await tx.done;
        if (!snapshot) throw new SaveError('missing', `Slot ${slot} is empty.`);
        const exportedAt = now();
        // Only a summary written by this very save version is known to have the fields a name needs.
        const position = record && record.schemaVersion === codec.version ? record.summary : null;
        return {
          name: saveFileName(position, exportedAt),
          text: encodeSaveFile({
            career: snapshot.career,
            schemaVersion: snapshot.schemaVersion,
            savedAt: snapshot.savedAt,
            appVersion: options.appVersion,
            exportedAt,
          }),
        };
      }),

    close() {
      const closing = connection;
      connection = undefined;
      void closing?.then((db) => db.close()).catch(() => undefined);
    },
  };
}
