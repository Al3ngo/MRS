/**
 * Screens are addressed by the part of the URL after "#", so the phone's back gesture, a reload and
 * a bookmarked screen all behave. No server is involved: the page itself never changes address.
 */
import { ROUNDS } from '../game/data/generated/rounds';
import { FIRST_SEASON, LAST_SEASON } from '../game/data/types';
import { isSlotId, type SlotId } from '../platform/saves';
import { createStore } from './store';

export type Route =
  | { screen: 'careers' }
  | { screen: 'career'; slot: SlotId }
  | { screen: 'almanac'; season: number }
  | { screen: 'race'; season: number; round: number }
  | { screen: 'system' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'system') return { screen: 'system' };
  if (parts[0] === 'career') {
    const slot = Number(parts[1]);
    if (isSlotId(slot)) return { screen: 'career', slot };
  }
  if (parts[0] === 'almanac') {
    const season = Number(parts[1]);
    return { screen: 'almanac', season: Number.isInteger(season) && season >= FIRST_SEASON && season <= LAST_SEASON ? season : FIRST_SEASON };
  }
  if (parts[0] === 'race') {
    const season = Number(parts[1]);
    const round = Number(parts[2]);
    if (ROUNDS[season]?.some((entry) => entry.round === round)) return { screen: 'race', season, round };
  }
  return { screen: 'careers' };
}

export function routeHash(route: Route): string {
  switch (route.screen) {
    case 'careers':
      return '#/';
    case 'career':
      return `#/career/${route.slot}`;
    case 'almanac':
      return `#/almanac/${route.season}`;
    case 'race':
      return `#/race/${route.season}/${route.round}`;
    case 'system':
      return '#/system';
  }
}

const inBrowser = typeof window !== 'undefined';

export const route = createStore<Route>(parseRoute(inBrowser ? location.hash : ''));

/** How many screens deep we are below the one the app opened on; 0 means "back" would leave the app. */
let depth = 0;
let shownHash = inBrowser ? location.hash : '';

function show(hash: string): void {
  if (hash === shownHash) return;
  shownHash = hash;
  route.set(parseRoute(hash));
}

export function startRouter(): void {
  depth = (history.state as { depth?: number } | null)?.depth ?? 0;
  // Back, forward, and an address typed by hand all arrive through one of these two events.
  window.addEventListener('popstate', (event) => {
    depth = (event.state as { depth?: number } | null)?.depth ?? 0;
    show(location.hash);
  });
  window.addEventListener('hashchange', () => show(location.hash));
}

/** Goes to a screen. `replace` swaps the current history entry instead of adding one. */
export function navigate(to: Route, options: { replace?: boolean } = {}): void {
  const hash = routeHash(to);
  if (options.replace) {
    history.replaceState({ depth }, '', hash);
  } else {
    if (routeHash(route.get()) === hash) return;
    depth += 1;
    history.pushState({ depth }, '', hash);
  }
  show(hash);
}

/**
 * The in-app back button. Steps back through history when this screen was reached from inside the
 * app; when the app was opened directly on this screen, goes to `fallback` instead of leaving.
 */
export function goBack(fallback: Route): void {
  if (depth > 0) history.back();
  else navigate(fallback, { replace: true });
}
