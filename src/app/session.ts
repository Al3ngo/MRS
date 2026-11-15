/**
 * What the app is doing right now: the three slots, the career being played, and every action that
 * changes them. Screens read the stores here and call these functions; nothing else touches storage.
 */
import { newCareer, replayTutorial, type CareerState } from '../game/career';
import { SaveError } from '../game/save-schema';
import { MAX_SAVE_FILE_BYTES, decodeSaveFile, type DecodedSave } from '../platform/savefile';
import { createSaveStore, type SlotId, type SlotRecord, type SlotView } from '../platform/saves';
import { applyUpdate } from '../platform/pwa';
import { requestPersistence } from '../platform/storage';
import { navigate } from './router';
import { createStore } from './store';

export const saves = createSaveStore({ appVersion: __APP_VERSION__ });

export interface ActiveCareer {
  slot: SlotId;
  career: CareerState;
  /** The slot's record as of the last completed save; null if it has not been read yet. */
  record: SlotRecord | null;
  /** Saves queued or in flight. */
  pendingSaves: number;
  /** Why the last save failed, in words; null when it worked. */
  saveError: string | null;
}

export interface AppState {
  /** 'starting' until the slots have been read from storage. */
  boot: 'starting' | 'ready' | 'failed';
  bootError: string | null;
  slots: SlotView[];
  active: ActiveCareer | null;
}

export const app = createStore<AppState>({ boot: 'starting', bootError: null, slots: [], active: null });

const patch = (changes: Partial<AppState>) => app.set((state) => ({ ...state, ...changes }));

// ── Messages ────────────────────────────────────────────────────────────────────────────────

export interface Toast {
  id: number;
  text: string;
  tone: 'plain' | 'problem';
}

export const toasts = createStore<Toast[]>([]);
let toastIds = 0;

export function toast(text: string, tone: Toast['tone'] = 'plain'): void {
  const id = ++toastIds;
  toasts.set((list) => [...list.slice(-2), { id, text, tone }]);
  window.setTimeout(() => dismissToast(id), tone === 'problem' ? 7000 : 3500);
}

export function dismissToast(id: number): void {
  toasts.set((list) => list.filter((item) => item.id !== id));
}

/** A failure in the player's words. */
export function explain(error: unknown): string {
  if (error instanceof SaveError) {
    switch (error.code) {
      case 'not-json':
      case 'not-a-save':
        return 'That file is not a Modern Racing Manager backup.';
      case 'too-new':
        return 'This career was saved by a newer version of the game. Update the game to open it.';
      case 'too-old':
        return 'This save comes from a version too old for this build to read.';
      case 'invalid':
        return `This save is damaged. ${error.problems[0] ?? ''}`.trim();
      case 'missing':
        return 'There is nothing saved there.';
      case 'storage':
        return 'The browser could not store the save. Free some space or leave private browsing, then try again.';
    }
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

// ── Slots ───────────────────────────────────────────────────────────────────────────────────

export async function boot(): Promise<void> {
  patch({ boot: 'starting', bootError: null });
  try {
    patch({ slots: await saves.list(), boot: 'ready' });
  } catch (error) {
    patch({ boot: 'failed', bootError: explain(error) });
  }
}

export async function refreshSlots(): Promise<void> {
  patch({ slots: await saves.list() });
}

/** Puts a freshly written record into the slot list without another trip to storage. */
function showRecord(record: SlotRecord): void {
  const view: SlotView = { slot: record.slot, kind: record.summary ? 'career' : 'damaged', record };
  app.set((state) => ({
    ...state,
    slots: state.slots.map((existing) => (existing.slot === record.slot ? view : existing)),
  }));
}

const newId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * Counts every request to show a career. Loading takes a moment, and the player can ask for another
 * screen meanwhile; only the latest request may decide which career is active. Each request first
 * writes anything the current career has not saved yet, so switching never loses progress.
 */
let requests = 0;

function activate(slot: SlotId, career: CareerState, record: SlotRecord | null): void {
  lastSaved = career;
  patch({ active: { slot, career, record, pendingSaves: 0, saveError: null } });
}

/** Lets go of the active career if it is the one in `slot`, after the slot's contents changed under it. */
function forget(slot: SlotId): void {
  app.set((state) => (state.active?.slot === slot ? { ...state, active: null } : state));
}

const recordOf = (slot: SlotId): SlotRecord | null => {
  const view = app.get().slots.find((candidate) => candidate.slot === slot);
  return view && view.kind !== 'empty' ? view.record : null;
};

export async function startCareer(slot: SlotId): Promise<void> {
  const request = ++requests;
  await autosave();
  const career = newCareer(newId(), new Date());
  const record = await saves.replace(slot, career);
  // Asked for at the moment there is first something to lose. The browser may or may not agree.
  void requestPersistence();
  showRecord(record);
  if (request !== requests) return;
  activate(slot, career, record);
  navigate({ screen: 'career', slot });
}

/** Loads the slot fresh from storage and opens it. */
export async function continueCareer(slot: SlotId): Promise<void> {
  const request = ++requests;
  await autosave();
  const career = await saves.load(slot);
  if (request !== requests) return;
  activate(slot, career, recordOf(slot));
  navigate({ screen: 'career', slot });
}

/**
 * Makes sure `slot` is the career being played. The career screen calls this when it opens, which
 * covers arriving by reload, by address or by the forward gesture rather than through a button.
 */
export async function enterCareer(slot: SlotId): Promise<void> {
  const request = ++requests;
  if (app.get().active?.slot === slot) return;
  await autosave();
  try {
    const career = await saves.load(slot);
    await refreshSlots();
    if (request !== requests) return;
    activate(slot, career, recordOf(slot));
  } catch (error) {
    if (request !== requests) return;
    toast(explain(error), 'problem');
    navigate({ screen: 'careers' }, { replace: true });
  }
}

/**
 * Called when the career screen closes. The career stays in memory, fully saved; it is only let go
 * of when its slot is deleted or replaced, so the order in which screens open and close never matters.
 */
export function leaveCareer(): Promise<void> {
  return autosave();
}

export async function deleteCareer(slot: SlotId): Promise<void> {
  // Any save still queued must land before the slot is emptied, not after.
  await autosave();
  await saves.remove(slot);
  forget(slot);
  await refreshSlots();
}

export async function restoreSafetyCopy(slot: SlotId): Promise<void> {
  await autosave();
  await saves.restoreSafetyCopy(slot);
  forget(slot);
  await refreshSlots();
}

// ── Playing and autosaving ──────────────────────────────────────────────────────────────────

/** The career object most recently handed to storage; anything else in `active` is unsaved. */
let lastSaved: CareerState | null = null;
/** Saves run one at a time, in the order they were asked for. */
let writes: Promise<void> = Promise.resolve();

const patchActive = (slot: SlotId, change: (active: ActiveCareer) => ActiveCareer) =>
  app.set((state) => (state.active?.slot === slot ? { ...state, active: change(state.active) } : state));

/**
 * Writes the career being played to its slot. Called after every session and race, and when the
 * app is sent to the background. Resolves once this save and any before it have finished; a failed
 * save is reported in `active.saveError` rather than thrown.
 */
export function autosave(): Promise<void> {
  const active = app.get().active;
  if (!active || active.career === lastSaved) return writes;
  const { slot, career } = active;
  lastSaved = career;
  patchActive(slot, (current) => ({ ...current, pendingSaves: current.pendingSaves + 1 }));

  writes = writes.then(async () => {
    try {
      const record = await saves.save(slot, career);
      showRecord(record);
      patchActive(slot, (current) => ({
        ...current,
        record,
        pendingSaves: current.pendingSaves - 1,
        saveError: null,
      }));
      if (!record.summary) {
        toast('This save failed a self-check. The last good save is kept as a safety copy.', 'problem');
      }
    } catch (error) {
      // Not saved after all: let the next autosave try this career again.
      if (lastSaved === career) lastSaved = null;
      patchActive(slot, (current) => ({
        ...current,
        pendingSaves: current.pendingSaves - 1,
        saveError: explain(error),
      }));
    }
  });
  return writes;
}

/**
 * Changes the career being played and autosaves it. Every session, every race and every choice
 * between races goes through here, so each is saved the moment it happens.
 */
export function updateCareer(change: (career: CareerState) => CareerState): Promise<void> {
  const active = app.get().active;
  if (!active) return writes;
  const career = change(active.career);
  if (career === active.career) return writes;
  patchActive(active.slot, (current) => ({ ...current, career }));
  return autosave();
}

/** Shows a career's tutorial again from the start, each tip the next time its screen comes up. */
export async function replayTutorialIn(slot: SlotId): Promise<boolean> {
  await enterCareer(slot);
  if (app.get().active?.slot !== slot) return false;
  await updateCareer(replayTutorial);
  return true;
}

/** The career being played, if it is the one in `slot`. */
export const careerIn = (slot: SlotId): CareerState | null => {
  const active = app.get().active;
  return active?.slot === slot ? active.career : null;
};

/** Hands over to a downloaded update, once everything is safely written. The page then reloads. */
export async function updateNow(): Promise<void> {
  await autosave();
  applyUpdate();
}

export function startAutosaveOnHide(): void {
  // Phones freeze or discard background apps without warning; this is the last reliable moment.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void autosave();
  });
}

// ── Backup files ────────────────────────────────────────────────────────────────────────────

export interface PreparedBackup {
  slot: SlotId;
  name: string;
  text: string;
  bytes: number;
}

export async function prepareBackup(slot: SlotId): Promise<PreparedBackup> {
  if (app.get().active?.slot === slot) await autosave();
  const file = await saves.exportFile(slot);
  return { slot, ...file, bytes: new Blob([file.text]).size };
}

/** Reads and checks a file the player picked. Throws SaveError if it cannot be used. */
export async function readBackup(file: File): Promise<DecodedSave> {
  if (file.size > MAX_SAVE_FILE_BYTES) {
    throw new SaveError('not-a-save', 'That file is far too large to be a save.');
  }
  return decodeSaveFile(await file.text());
}

export async function importCareer(slot: SlotId, backup: DecodedSave): Promise<void> {
  await autosave();
  await saves.replace(slot, backup.career);
  forget(slot);
  void requestPersistence();
  await refreshSlots();
}
