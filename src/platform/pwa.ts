/**
 * The installed-app side of things: the service worker that makes the game work offline, the
 * update hand-over, and the "add to home screen" prompt.
 */
import { createStore } from '../app/store';

export interface OfflineState {
  /**
   * 'unsupported': this browser or address cannot run a service worker (or this is a dev server).
   * 'preparing': the game's files are being downloaded for the first time.
   * 'ready': every file is stored on the device; the game runs with no connection.
   * 'failed': the download did not complete.
   */
  status: 'unsupported' | 'preparing' | 'ready' | 'failed';
  /** A newer version has been downloaded and is waiting to take over. */
  updateWaiting: boolean;
  /** Result of the last manual update check, for the System screen. */
  lastCheck: 'none' | 'checking' | 'current' | 'found' | 'unreachable';
}

export const offline = createStore<OfflineState>({
  status: 'preparing',
  updateWaiting: false,
  lastCheck: 'none',
});

const patch = (changes: Partial<OfflineState>) => offline.set((state) => ({ ...state, ...changes }));

let registration: ServiceWorkerRegistration | undefined;
let lastAutomaticCheck = 0;
const AUTOMATIC_CHECK_INTERVAL = 60 * 60 * 1000;

/** Follows a newly found worker until it has finished downloading. */
function watch(worker: ServiceWorker | null) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      patch({ updateWaiting: true, lastCheck: 'found' });
    }
    if (worker.state === 'redundant' && !registration?.active) patch({ status: 'failed' });
  });
}

export async function startOffline(): Promise<void> {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) {
    patch({ status: 'unsupported' });
    return;
  }

  // The page reloads exactly when a NEW version takes over. The first worker claiming a page that
  // had none is not a new version, and reloading then would only interrupt the first visit.
  let controlled = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true;
      return;
    }
    window.location.reload();
  });

  try {
    registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch {
    patch({ status: 'failed' });
    return;
  }
  // Some locked-down browsers answer without a registration instead of refusing outright.
  if (!registration) {
    patch({ status: 'unsupported' });
    return;
  }

  if (registration.waiting && navigator.serviceWorker.controller) patch({ updateWaiting: true });
  watch(registration.installing);
  registration.addEventListener('updatefound', () => watch(registration?.installing ?? null));

  // An active worker has, by definition, finished storing every file.
  void navigator.serviceWorker.ready.then(() => patch({ status: 'ready' }));

  // A home-screen app can stay open for days; look for a new version when it comes back into view.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastAutomaticCheck < AUTOMATIC_CHECK_INTERVAL) return;
    lastAutomaticCheck = Date.now();
    void registration?.update().catch(() => undefined);
  });
}

/** Asks the server whether a newer version exists. Reports the outcome in `offline.lastCheck`. */
export async function checkForUpdate(): Promise<void> {
  if (!registration) return;
  patch({ lastCheck: 'checking' });
  try {
    await registration.update();
  } catch {
    patch({ lastCheck: 'unreachable' });
    return;
  }
  // `update()` resolves once the server has answered; a newer worker, if any, is installing by now.
  const found = Boolean(registration.installing || registration.waiting);
  if (found) patch({ lastCheck: 'found', updateWaiting: Boolean(registration.waiting) || offline.get().updateWaiting });
  else patch({ lastCheck: 'current' });
}

/** Hands over to the waiting version. The page reloads as soon as it has taken control. */
export function applyUpdate(): void {
  const waiting = registration?.waiting;
  if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
  // Nothing is waiting any more (another window already switched over): a reload picks it up.
  else window.location.reload();
}

// ── Add to home screen ──────────────────────────────────────────────────────────────────────

/** Chrome's install prompt event; not in the standard DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallState {
  /** Running from the home screen (or an installed desktop window) rather than a browser tab. */
  installed: boolean;
  /** The browser has offered an install prompt this page can trigger. */
  canPrompt: boolean;
  /** iPhone and iPad have no prompt: the player adds the app from Safari's Share menu. */
  needsShareMenu: boolean;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isAppleTouchDevice(): boolean {
  const agent = navigator.userAgent;
  // iPadOS reports itself as a Mac; the touch points give it away.
  return /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
}

export const install = createStore<InstallState>({
  installed: false,
  canPrompt: false,
  needsShareMenu: false,
});

let promptEvent: BeforeInstallPromptEvent | undefined;

export function startInstallWatch(): void {
  install.set({ installed: isStandalone(), canPrompt: false, needsShareMenu: isAppleTouchDevice() });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    promptEvent = event as BeforeInstallPromptEvent;
    install.set((state) => ({ ...state, canPrompt: true }));
  });
  window.addEventListener('appinstalled', () => {
    promptEvent = undefined;
    install.set((state) => ({ ...state, installed: true, canPrompt: false }));
  });
  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => {
    install.set((state) => ({ ...state, installed: isStandalone() }));
  });
}

/** Shows the browser's install prompt. Must be called from a tap. */
export async function promptInstall(): Promise<void> {
  const event = promptEvent;
  if (!event) return;
  promptEvent = undefined;
  install.set((state) => ({ ...state, canPrompt: false }));
  await event.prompt();
  await event.userChoice.catch(() => undefined);
}
