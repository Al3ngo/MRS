/**
 * Set scenes for screenshots and design checks: each one fills the save slots with a known state.
 *
 * Only reachable in a build made with `vite build --mode inspect`, by opening the page with
 * `?scene=<name>`. It is not part of the game and is left out of normal builds.
 */
import { openDB } from 'idb';
import { newCareer, roundsIn, type CareerState, type SessionKind } from '../game/career';
import { SCHEMA_VERSION } from '../game/save-schema';
import { DEFAULT_DATABASE_NAME, SLOT_IDS, createSaveStore, type SlotId } from '../platform/saves';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A career for a scene: the team and the point of the calendar it has reached, with no results kept. */
function careerAt(
  id: string,
  team: string,
  seasonYear: number,
  round: number,
  phase: SessionKind,
  finished = false,
): CareerState {
  return {
    ...newCareer(id, new Date(Date.now() - 40 * DAY)),
    team,
    seasonYear,
    round,
    phase,
    sessionsCompleted: (seasonYear - 2010) * 90 + round * 4,
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
    await put(1, careerAt('scene-one', 'ferrari', 2010, 3, 'qualifying'), 4 * MINUTE);
  },
  /** All three slots in use, at different points of the timeline. */
  three: async () => {
    await put(1, careerAt('scene-a', 'mclaren', 2012, 7, 'race'), 3 * DAY);
    await put(2, careerAt('scene-b', 'williams', 2019, 14, 'management'), 25 * MINUTE);
    await put(3, careerAt('scene-c', 'hrt', 2024, 22, 'practice'), 9 * DAY);
  },
  /** A finished career, a damaged save with a safety copy, and a save from a newer version. */
  trouble: async () => {
    await put(1, careerAt('scene-done', 'red-bull', 2026, roundsIn(2026), 'management', true), 2 * HOUR);
    await put(2, careerAt('scene-damaged', 'sauber', 2015, 9, 'race'), 1 * DAY);
    await tamper(2, 'damaged');
    await put(3, careerAt('scene-newer', 'mercedes', 2021, 4, 'practice'), 6 * DAY);
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
