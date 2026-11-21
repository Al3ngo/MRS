/**
 * The game plays in landscape. Where the browser lets a page lock the screen sideways (an installed
 * app on Android) it is asked to. Where it does not (iPhone and iPad), the game copes with a phone
 * held upright in one of two ways, the player's choice:
 *
 *   - 'turn' (the default): the game turns itself a quarter turn on the screen, so it plays held
 *     sideways even with the phone's rotation lock on. Which way it turns follows the phone: its
 *     motion sensor tells which way round it is held (the charging port on the left or the right),
 *     and the game turns to match, as a native game would. The player can fix a side instead.
 *   - 'ask': the game hides behind "Turn your phone sideways" until the screen is turned, as an
 *     app with the rotation lock off would.
 *
 * The view is shown to the styles as attributes on <html>: data-turn="right" or "left" while the
 * game is turned, data-ask while it is asking. Settings are kept on the device, apart from careers.
 */
import { createStore } from '../app/store';

export type Side = 'right' | 'left';

export interface ViewSettings {
  /** What to do with the phone upright. */
  upright: 'turn' | 'ask';
  /** Where the charging port goes when the game is turned, or 'auto' to follow the phone. */
  port: 'auto' | Side;
  /** The way the phone was last found held, to start the next time the same way. */
  lastSide: Side;
}

export interface ViewState {
  /** The screen is taller than it is wide. */
  upright: boolean;
  /** The game is drawn turned, and which way: 'right' turns it clockwise (the port on the right). */
  turn: Side | null;
  /** The game is hidden behind "Turn your phone sideways". */
  asking: boolean;
}

const KEY = 'mrm-view';
const DEFAULTS: ViewSettings = { upright: 'turn', port: 'auto', lastSide: 'right' };

function load(): ViewSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ViewSettings> | null;
    if (!stored) return DEFAULTS;
    return {
      upright: stored.upright === 'ask' ? 'ask' : 'turn',
      port: stored.port === 'left' || stored.port === 'right' ? stored.port : 'auto',
      lastSide: stored.lastSide === 'left' ? 'left' : 'right',
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
  if (settings.upright === 'ask') return { upright, turn: null, asking: true };
  return { upright, turn: settings.port === 'auto' ? settings.lastSide : settings.port, asking: false };
}

export const view = createStore<ViewState>(viewFor(query?.matches ?? false, viewSettings.get()));

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(viewSettings.get()));
  } catch {
    // Private windows may refuse; the setting holds until the page closes.
  }
}

/** Shows the view to the styles. */
function apply(): void {
  const next = viewFor(query?.matches ?? false, viewSettings.get());
  view.set((current) => (current.upright === next.upright && current.turn === next.turn && current.asking === next.asking ? current : next));
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (next.turn) root.setAttribute('data-turn', next.turn);
  else root.removeAttribute('data-turn');
  root.toggleAttribute('data-ask', next.asking);
  measureScreen();
}

export function setView(change: Partial<ViewSettings>): void {
  viewSettings.set((current) => ({ ...current, ...change }));
  save();
  apply();
}

// ── The screen's real size ──────────────────────────────────────────────────────────────────

/**
 * The screen's size, measured, for the styles (--screen-w, --screen-h). The CSS viewport units
 * cannot be trusted for this: an iPhone running the game from its home screen reports the screen
 * short by the height of its status bar (62 points on an iPhone 16 Pro), which left a black band
 * along one end of the turned game. An installed app fills the screen, so there the screen's own
 * size wins when the two differ by about a status bar.
 */
let probe: HTMLElement | null = null;

const standalone = (): boolean =>
  (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
  (typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true);

export function screenSize(measured: { width: number; height: number }, device: { width: number; height: number } | null): { width: number; height: number } {
  let { width, height } = measured;
  if (device) {
    const short = Math.min(device.width, device.height);
    const long = Math.max(device.width, device.height);
    const [fullWidth, fullHeight] = height >= width ? [short, long] : [long, short];
    if (fullHeight > height && fullHeight - height <= 90) height = fullHeight;
    if (fullWidth > width && fullWidth - width <= 90) width = fullWidth;
  }
  return { width, height };
}

function measureScreen(): void {
  if (typeof document === 'undefined' || !document.body) return;
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none;';
    document.body.appendChild(probe);
  }
  const size = screenSize(
    { width: Math.max(probe.offsetWidth, window.innerWidth || 0), height: Math.max(probe.offsetHeight, window.innerHeight || 0) },
    standalone() && typeof screen !== 'undefined' ? { width: screen.width, height: screen.height } : null,
  );
  const root = document.documentElement;
  root.style.setProperty('--screen-w', `${size.width}px`);
  root.style.setProperty('--screen-h', `${size.height}px`);
}

// ── Which way round the phone is held ───────────────────────────────────────────────────────

/** Whether this is an iPhone or iPad, whose motion sensor reports gravity the other way round. */
const apple = (): boolean =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/**
 * Which way round the phone is held, from the motion sensor's reading of gravity (the phone's x
 * running across its screen, y up it, z out of it), or null when it cannot tell (lying flat, held
 * upright, or turning). By the standard, a phone at rest reads +9.8 along whichever axis points
 * up; iPhones read the opposite sign, so `flipped` turns their reading round. Held sideways with
 * the charging port on the right, the screen's right edge points up: +x.
 */
export function sideFromGravity(gravity: { x: number; y: number; z: number }, flipped: boolean): Side | null {
  const sign = flipped ? -1 : 1;
  const x = sign * gravity.x;
  const y = sign * gravity.y;
  const z = sign * gravity.z;
  const size = Math.hypot(x, y, z);
  if (size < 4) return null;
  if (Math.abs(z) / size > 0.8) return null;
  if (Math.abs(x) / size < 0.6 || Math.abs(x) < Math.abs(y)) return null;
  return x > 0 ? 'right' : 'left';
}

export type MotionAccess = 'not-needed' | 'not-asked' | 'granted' | 'refused';

type AskingMotion = typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

const motionNeedsAsking = (): boolean =>
  typeof DeviceMotionEvent !== 'undefined' && typeof (DeviceMotionEvent as AskingMotion).requestPermission === 'function';

const MOTION_KEY = 'mrm-motion';
const storedMotion = (): string | null => {
  try {
    return localStorage.getItem(MOTION_KEY);
  } catch {
    return null;
  }
};

/** Whether the game may read the motion sensor: iPhones ask the player once. */
export const motionAccess = createStore<MotionAccess>(
  typeof window === 'undefined' ? 'not-needed' : motionNeedsAsking() ? (storedMotion() === 'granted' ? 'granted' : 'not-asked') : 'not-needed',
);

let leaning: { side: Side; since: number } | null = null;
/** How long the phone must stay round the other way before the game turns: no flicker. */
const SETTLE_MS = 350;

function onMotion(event: DeviceMotionEvent): void {
  const reading = event.accelerationIncludingGravity;
  if (!reading || reading.x === null || reading.y === null || reading.z === null) return;
  const settings = viewSettings.get();
  if (settings.port !== 'auto') return;
  const side = sideFromGravity({ x: reading.x, y: reading.y, z: reading.z }, apple());
  if (!side || side === settings.lastSide) {
    leaning = null;
    return;
  }
  const now = event.timeStamp || performance.now();
  if (!leaning || leaning.side !== side) {
    leaning = { side, since: now };
    return;
  }
  if (now - leaning.since >= SETTLE_MS) {
    leaning = null;
    setView({ lastSide: side });
  }
}

/** Asks the player to let the game read the motion sensor. Call from a tap. */
export async function askForMotion(): Promise<MotionAccess> {
  if (!motionNeedsAsking()) return motionAccess.get();
  try {
    const answer = await (DeviceMotionEvent as AskingMotion).requestPermission!();
    const access: MotionAccess = answer === 'granted' ? 'granted' : 'refused';
    motionAccess.set(access);
    try {
      localStorage.setItem(MOTION_KEY, access);
    } catch {
      // Kept for this visit only.
    }
    return access;
  } catch {
    motionAccess.set('refused');
    return 'refused';
  }
}

type LockingOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };

/** On the first touch: the landscape lock (Android's installed app), and the motion sensor again. */
function onFirstTouch(): void {
  const orientation = (typeof screen !== 'undefined' ? screen.orientation : undefined) as LockingOrientation | undefined;
  try {
    if (orientation?.lock) void orientation.lock('landscape').catch(() => undefined);
  } catch {
    // Not offered here: the game turns itself, or asks to be turned.
  }
  // An iPhone that allowed the motion sensor before is asked again, quietly, for this visit.
  if (motionNeedsAsking() && storedMotion() === 'granted') void askForMotion();
}

/** Starts following the screen and the phone. Once, at boot. */
export function watchOrientation(): void {
  apply();
  query?.addEventListener('change', apply);
  window.addEventListener('resize', measureScreen);
  window.visualViewport?.addEventListener('resize', measureScreen);
  window.addEventListener('orientationchange', () => setTimeout(measureScreen, 250));
  // iPhones settle their sizes a moment after the page opens.
  for (const wait of [100, 500, 1500]) setTimeout(measureScreen, wait);
  window.addEventListener('devicemotion', onMotion);
  window.addEventListener('pointerup', onFirstTouch, { once: true, capture: true, passive: true });
  // "Turn your phone sideways" offers the other way: let the game turn itself.
  document.querySelector('[data-turn-instead]')?.addEventListener('click', () => setView({ upright: 'turn' }));
}
