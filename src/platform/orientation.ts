/**
 * The game plays in landscape. Where the browser lets a page lock the screen sideways (an
 * installed app on Android) it is asked to; everywhere else (iPhone and iPad, any browser tab) the
 * page shows "Turn your phone sideways" while the screen is upright (see .rotate in the styles),
 * and the race clock holds until it is turned back.
 */
import { createStore } from '../app/store';

const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(orientation: landscape)') : null;

/** Whether the screen is sideways now. */
export const landscape = createStore<boolean>(query ? query.matches : true);

type LockingOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };

/** Asks for the landscape lock. Browsers allow it only in an installed app, after a touch. */
function askForLock(): void {
  const orientation = (typeof screen !== 'undefined' ? screen.orientation : undefined) as LockingOrientation | undefined;
  if (!orientation?.lock) return;
  try {
    void orientation.lock('landscape').catch(() => undefined);
  } catch {
    // Not offered here: the rotate prompt does the job.
  }
}

/** Starts following the screen's orientation. Once, at boot. */
export function watchOrientation(): void {
  query?.addEventListener('change', (event) => landscape.set(event.matches));
  window.addEventListener('pointerup', askForLock, { once: true, capture: true, passive: true });
}
