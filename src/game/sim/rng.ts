/**
 * Luck, made repeatable.
 *
 * All of a session's randomness comes from one number kept in its state. The same seed gives the
 * same race, lap for lap, and a race saved half way carries on exactly as it would have.
 */

/** Anything that carries the generator's state. */
export interface Luck {
  rng: number;
}

/** A number from 0 up to, not including, 1. (mulberry32) */
export function random(luck: Luck): number {
  let t = (luck.rng = (luck.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const chance = (luck: Luck, probability: number): boolean => random(luck) < probability;

export const between = (luck: Luck, low: number, high: number): number => low + (high - low) * random(luck);

/** A whole number from low to high, both included. */
export const wholeBetween = (luck: Luck, low: number, high: number): number =>
  low + Math.floor(random(luck) * (high - low + 1));

/** A draw from the bell curve: mean 0, standard deviation 1. */
export function gaussian(luck: Luck): number {
  const u = Math.max(random(luck), 1e-12);
  const v = random(luck);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pick<T>(luck: Luck, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('Nothing to pick from');
  return items[Math.floor(random(luck) * items.length)]!;
}

/** Picks an index, each with the chance its weight gives it. */
export function pickWeighted(luck: Luck, weights: readonly number[]): number {
  let total = 0;
  for (const weight of weights) total += weight;
  let roll = random(luck) * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

/** A seed from anything that names a session: seedFrom(careerId, 2014, 7, 'race'). (FNV-1a) */
export function seedFrom(...parts: readonly (string | number)[]): number {
  let hash = 0x811c9dc5;
  for (const char of parts.join('|')) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

export const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
