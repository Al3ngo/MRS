/**
 * Set scenes for screenshots and design checks: each one fills the save slots with a known state.
 *
 * Only reachable in a build made with `vite build --mode inspect`, by opening the page with
 * `?scene=<name>`. It is not part of the game and is left out of normal builds.
 */
import { openDB } from 'idb';
import {
  FIRST_SEASON,
  WEEKEND_PHASES,
  roundsIn,
  type CareerState,
  type WeekendPhase,
} from '../game/career';
import { SCHEMA_VERSION } from '../game/save-schema';
import { DEFAULT_DATABASE_NAME, SLOT_IDS, createSaveStore, type SlotId } from '../platform/saves';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function careerAt(id: string, seasonYear: number, round: number, phase: WeekendPhase, finished = false): CareerState {
  let sessions = (round - 1) * WEEKEND_PHASES.length + WEEKEND_PHASES.indexOf(phase);
  for (let year = FIRST_SEASON; year < seasonYear; year++) sessions += roundsIn(year) * WEEKEND_PHASES.length;
  return {
    id,
    createdAt: new Date(Date.now() - 40 * DAY).toISOString(),
    seasonYear,
    round,
    phase,
    sessionsCompleted: sessions,
    finished,
  };
}

/** Writes a career to a slot as if it had been saved `ago` milliseconds in the past, twice, so it has a safety copy. */
async function put(slot: SlotId, career: CareerState, ago: number): Promise<void> {
  const store = createSaveStore({ appVersion: __APP_VERSION__, now: () => new Date(Date.now() - ago) });
  await store.replace(slot, career);
  await store.save(slot, career);
  store.close();
}

/** Rewrites a stored slot directly, to stage states the game itself would never write. */
async function tamper(slot: SlotId, change: 'newer' | 'damaged'): Promise<void> {
  const db = await openDB(DEFAULT_DATABASE_NAME);
  const record = await db.get('slots', slot);
  const snapshot = await db.get('snapshots', [slot, 'current']);
  if (change === 'newer') {
    await db.put('slots', { ...record, schemaVersion: SCHEMA_VERSION + 1 });
    await db.put('snapshots', { ...snapshot, schemaVersion: SCHEMA_VERSION + 1 });
  } else {
    await db.put('slots', { ...record, summary: null });
    await db.put('snapshots', { ...snapshot, sound: false, career: { ...snapshot.career, round: 99 } });
  }
  db.close();
}

const SCENES: Readonly<Record<string, () => Promise<void>>> = {
  /** First run: nothing saved. */
  empty: async () => {},
  /** One career under way. */
  one: async () => {
    await put(1, careerAt('scene-one', 2010, 3, 'qualifying'), 4 * MINUTE);
  },
  /** All three slots in use, at different points of the timeline. */
  three: async () => {
    await put(1, careerAt('scene-a', 2012, 7, 'race'), 3 * DAY);
    await put(2, careerAt('scene-b', 2019, 14, 'management'), 25 * MINUTE);
    await put(3, careerAt('scene-c', 2024, 22, 'practice'), 9 * DAY);
  },
  /** A finished career, a damaged save with a safety copy, and a save from a newer version. */
  trouble: async () => {
    await put(1, careerAt('scene-done', 2026, roundsIn(2026), 'management', true), 2 * HOUR);
    await put(2, careerAt('scene-damaged', 2015, 9, 'race'), 1 * DAY);
    await tamper(2, 'damaged');
    await put(3, careerAt('scene-newer', 2021, 4, 'practice'), 6 * DAY);
    await tamper(3, 'newer');
  },
};

export async function applyScene(name: string): Promise<void> {
  const scene = SCENES[name];
  if (!scene) throw new Error(`Unknown scene "${name}". Known: ${Object.keys(SCENES).join(', ')}`);
  const store = createSaveStore({ appVersion: __APP_VERSION__ });
  for (const slot of SLOT_IDS) await store.remove(slot);
  store.close();
  await scene();
}
