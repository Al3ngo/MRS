/**
 * A minimal observable value. The whole app's state lives in a few of these; components subscribe
 * with `useStore` and re-render when the value is replaced.
 */
import { useEffect, useReducer } from 'preact/hooks';

export interface Store<T> {
  get(): T;
  /** Replaces the value. An updater must return a new object rather than mutate the old one. */
  set(next: T | ((current: T) => T)): void;
  /** Calls `listener` after every change. Returns the function that stops it. */
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      const updated = typeof next === 'function' ? (next as (current: T) => T)(value) : next;
      if (Object.is(updated, value)) return;
      value = updated;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Reads a store in a component and re-renders the component whenever the store changes. */
export function useStore<T>(store: Store<T>): T {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const seen = store.get();
  useEffect(() => {
    // A change between this render and the subscription would otherwise be missed.
    if (!Object.is(store.get(), seen)) rerender(0);
    return store.subscribe(() => rerender(0));
  }, [store]);
  return seen;
}
