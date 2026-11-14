/**
 * Weather: when it rains during a session, and how wet the track is as a result.
 *
 * The rain of a session is decided before it starts (so a forecast can be honest) as a list of
 * spells. The track then gets wet quickly and dries slowly.
 */
import { between, chance, clamp, random, type Luck } from './rng';
import type { RainSpell } from './types';

/** Seconds a spell takes to build up and to die away. */
const RAMP = 150;

/**
 * The rain for a session `duration` seconds long, at a circuit where it rains in `rainChance` of
 * races. A spell may begin before the start, in which case the session starts on a wet track.
 */
export function makeWeather(luck: Luck, rainChance: number, duration: number): RainSpell[] {
  if (!chance(luck, rainChance)) return [];
  const spells: RainSpell[] = [];
  const count = chance(luck, 0.3) ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const from = between(luck, -1500, duration * 0.9);
    const length = between(luck, 300, 2400);
    const roll = random(luck);
    spells.push({ from, to: from + length, intensity: 0.22 + 0.73 * roll * roll });
  }
  return spells.sort((a, b) => a.from - b.from);
}

/** How hard it is raining at a moment, 0 to 1. */
export function rainAt(spells: readonly RainSpell[], clock: number): number {
  let rain = 0;
  for (const spell of spells) {
    if (clock <= spell.from || clock >= spell.to) continue;
    const edge = Math.min(clock - spell.from, spell.to - clock, RAMP) / RAMP;
    rain = Math.max(rain, spell.intensity * edge);
  }
  return rain;
}

/** The track's wetness after `dt` more seconds of rain at `rain`. */
export function settle(wetness: number, rain: number, dt: number): number {
  if (rain > wetness) return Math.min(rain, wetness + (rain - wetness) * (dt / 200) + dt * 0.0002);
  // Drying: quicker while cars are running and the worst of it has gone.
  return clamp(wetness - dt * (0.0005 + 0.0004 * (1 - rain)), rain, 1);
}

/** How wet the track is when the session starts, from any rain before it. */
export function wetnessAtStart(spells: readonly RainSpell[]): number {
  let wetness = 0;
  for (let clock = -3600; clock < 0; clock += 30) wetness = settle(wetness, rainAt(spells, clock), 30);
  return wetness;
}

/** Seconds until rain next starts, looking no further than `horizon`; null if none is on the way. */
export function rainDueIn(spells: readonly RainSpell[], clock: number, horizon: number): number | null {
  for (const spell of spells) {
    if (spell.from > clock && spell.from - clock <= horizon) return spell.from - clock;
  }
  return null;
}
