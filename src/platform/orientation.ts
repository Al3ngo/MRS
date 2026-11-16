/**
 * The game plays in landscape. Where the browser lets a page lock the screen sideways (an installed
 * app on Android) it is asked to. Where it does not (iPhone and iPad), the game copes with a phone
 * held upright in one of two ways, the player's choice:
 *
 *   - 'turn' (the default): the game turns itself a quarter turn on the screen, so it plays held
 *     sideways even with the phone's rotation lock on. Which way it turns is set by where the
 *     player wants the phone's charging port: on the right, or on the left.
 *   - 'ask': the game hides behind "Turn your phone sideways" until the screen is turned, as an
 *     app with the rotation lock off would.
 *
 * The choice is shown to the styles as an attribute on <html>: data-turn="right" or "left" while
 * the game is turned, data-ask while it is asking. Kept on the device, apart from the careers.
 */
import { createStore } from '../app/store';

export interface ViewSettings {
  /** What to do with the phone upright. */
  upright: 'turn' | 'ask';
  /** Where the charging port goes when the game is turned: decides which way it turns. */
  port: 'right' | 'left';
}

export interface ViewState {
  /** The screen is taller than it is wide. */
  upright: boolean;
  /** The game is drawn turned, and which way: 'right' turns it clockwise (the port on the right). */
  turn: 'right' | 'left' | null;
  /** The game is hidden behind "Turn your phone sideways". */
  asking: boolean;
}

const KEY = 'mrm-view';
const DEFAULTS: ViewSettings = { upright: 'turn', port: 'right' };

function load(): ViewSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ViewSettings> | null;
    if (!stored) return DEFAULTS;
    return {
      upright: stored.upright === 'ask' ? 'ask' : 'turn',
      port: stored.port === 'left' ? 'left' : 'right',
    };
  } catch {
    return DEFAULTS;
  }
}

export const viewSettings = createStore<ViewSettings>(typeof localStorage === 'undefined' ? DEFAULTS : load());

const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(orientation: portrait)') : null;

/** What the screen and the settings make of the view now. */
export function viewFor(upright: boolean, settings: ViewSettings): ViewState {
  if (!upright) return { upright, turn: null, asking: false };
  return settings.upright === 'turn' ? { upright, turn: settings.port, asking: false } : { upright, turn: null, asking: true };
}

export const view = createStore<ViewState>(viewFor(query?.matches ?? false, viewSettings.get()));

/** Shows the view to the styles. */
function apply(): void {
  const next = viewFor(query?.matches ?? false, viewSettings.get());
  view.set((current) => (current.upright === next.upright && current.turn === next.turn && current.asking === next.asking ? current : next));
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (next.turn) root.setAttribute('data-turn', next.turn);
  else root.removeAttribute('data-turn');
  root.toggleAttribute('data-ask', next.asking);
}

export function setView(change: Partial<ViewSettings>): void {
  viewSettings.set((current) => ({ ...current, ...change }));
  try {
    localStorage.setItem(KEY, JSON.stringify(viewSettings.get()));
  } catch {
    // Private windows may refuse; the setting holds until the page closes.
  }
  apply();
}

type LockingOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };

/** Asks for the landscape lock. Browsers allow it only in an installed app, after a touch. */
function askForLock(): void {
  const orientation = (typeof screen !== 'undefined' ? screen.orientation : undefined) as LockingOrientation | undefined;
  if (!orientation?.lock) return;
  try {
    void orientation.lock('landscape').catch(() => undefined);
  } catch {
    // Not offered here: the game turns itself, or asks to be turned.
  }
}

/** Starts following the screen's orientation. Once, at boot. */
export function watchOrientation(): void {
  apply();
  query?.addEventListener('change', apply);
  window.addEventListener('pointerup', askForLock, { once: true, capture: true, passive: true });
  // "Turn your phone sideways" offers the other way: let the game turn itself.
  document.querySelector('[data-turn-instead]')?.addEventListener('click', () => setView({ upright: 'turn' }));
}
