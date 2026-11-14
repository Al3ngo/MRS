import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash, type Route } from '../src/app/router';
import { createStore } from '../src/app/store';
import { describePosition, formatBytes, formatWhen, roundLabel } from '../src/ui/format';

describe('routes', () => {
  const routes: Route[] = [
    { screen: 'careers' },
    { screen: 'system' },
    { screen: 'career', slot: 1 },
    { screen: 'career', slot: 2 },
    { screen: 'career', slot: 3 },
  ];

  it('round-trips every screen through its address', () => {
    for (const route of routes) expect(parseRoute(routeHash(route))).toEqual(route);
  });

  it('opens the careers list for anything it does not recognise', () => {
    for (const hash of ['', '#', '#/', '#/career', '#/career/0', '#/career/4', '#/career/x', '#/career/1.5', '#/nowhere']) {
      expect(parseRoute(hash), hash).toEqual({ screen: 'careers' });
    }
  });

  it('is forgiving about slashes', () => {
    expect(parseRoute('#career/2')).toEqual({ screen: 'career', slot: 2 });
    expect(parseRoute('#/career/2/')).toEqual({ screen: 'career', slot: 2 });
    expect(parseRoute('#/system/')).toEqual({ screen: 'system' });
  });
});

describe('store', () => {
  it('tells listeners about changes, and only about changes', () => {
    const store = createStore({ count: 0 });
    let calls = 0;
    const stop = store.subscribe(() => calls++);
    store.set({ count: 1 });
    store.set((current) => ({ count: current.count + 1 }));
    expect(store.get()).toEqual({ count: 2 });
    expect(calls).toBe(2);

    store.set((current) => current); // same object: nothing changed
    expect(calls).toBe(2);

    stop();
    store.set({ count: 9 });
    expect(calls).toBe(2);
  });

  it('lets a listener unsubscribe while a change is being announced', () => {
    const store = createStore(0);
    const seen: string[] = [];
    const stopFirst = store.subscribe(() => {
      seen.push('first');
      stopFirst();
    });
    store.subscribe(() => seen.push('second'));
    store.set(1);
    store.set(2);
    expect(seen).toEqual(['first', 'second', 'second']);
  });
});

describe('wording', () => {
  const summary = {
    seasonYear: 2012,
    round: 7,
    rounds: 20,
    phase: 'race' as const,
    racesRun: 6,
    sessionsCompleted: 178,
    finished: false,
  };

  it('describes where a career stands', () => {
    expect(roundLabel(summary)).toBe('Round 7 of 20');
    expect(describePosition(summary)).toBe('season 2012, round 7 of 20');
    expect(describePosition({ ...summary, seasonYear: 2026, finished: true })).toBe('season 2026, career complete');
  });

  it('gives sizes the way a person would say them', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(172)).toBe('172 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1000)).toBe('1.0 kB');
    expect(formatBytes(4200)).toBe('4.2 kB');
    expect(formatBytes(52_400)).toBe('52 kB');
    expect(formatBytes(1_300_000)).toBe('1.3 MB');
  });

  it('dates a save relative to today', () => {
    const now = new Date(2026, 10, 12, 19, 30);
    const at = (year: number, month: number, day: number, hour: number, minute: number) =>
      new Date(year, month, day, hour, minute).toISOString();
    expect(formatWhen(at(2026, 10, 12, 0, 5), now)).toMatch(/^today at /);
    expect(formatWhen(at(2026, 10, 11, 23, 59), now)).toMatch(/^yesterday at /);
    expect(formatWhen(at(2026, 10, 3, 21, 15), now)).toMatch(/^3 Nov at /);
    expect(formatWhen(at(2025, 10, 3, 21, 15), now)).toBe('3 Nov 2025');
  });
});
