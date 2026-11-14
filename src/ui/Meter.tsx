/**
 * A reading shown as a bar instead of a number: tyre life, fuel, battery, track wetness, stress.
 * The bar fills to the reading, and its colour says how things stand: green is fine, amber is
 * worth watching, red needs doing something about. Its length carries the same news, for anyone
 * who does not tell red from green.
 */

/** Green, amber and red, as on the rest of the screen (tokens.css: --good, --fair, --bad). */
const GOOD = [82, 194, 106] as const;
const FAIR = [229, 169, 59] as const;
const BAD = [229, 72, 77] as const;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/** The colour for how good a reading is: 0 is red, 0.5 amber, 1 green. */
export function meterColour(good: number): string {
  const share = clamp01(good);
  const [from, to, t] = share < 0.5 ? [BAD, FAIR, share / 0.5] : [FAIR, GOOD, (share - 0.5) / 0.5];
  const mix = (i: 0 | 1 | 2): number => Math.round(from[i] + (to[i] - from[i]) * t);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

export interface MeterProps {
  /** How full the bar is, 0 to 1. */
  fill: number;
  /** How good the reading is, 0 (red) to 1 (green). Defaults to the fill. */
  good?: number;
  /** What the bar says, in words, for screen readers. */
  label: string;
  /** 'thin' for a bar along an edge, 'small' for inside a row of text. */
  size?: 'normal' | 'small' | 'thin';
  class?: string;
}

export function Meter({ fill, good, label, size = 'normal', class: extra }: MeterProps) {
  const width = clamp01(fill);
  return (
    <span class={`meter meter--${size}${extra ? ` ${extra}` : ''}`} role="img" aria-label={label}>
      <span class="meter__fill" style={{ width: `${(width * 100).toFixed(1)}%`, background: meterColour(good ?? width) }} />
    </span>
  );
}

// ── The readings ────────────────────────────────────────────────────────────────────────────

/** Tyre life left: full when new, empty when worn out. */
export const tyreMeter = (wear: number): { fill: number; good: number; words: string } => {
  const left = clamp01(1 - wear);
  const words = wear >= 1 ? 'worn out' : left > 0.66 ? 'fresh' : left > 0.33 ? 'part worn' : 'nearly worn out';
  return { fill: left, good: left, words };
};

/**
 * Fuel: the bar empties through the race; its colour says whether what is left reaches the flag.
 * `spare` is laps of fuel more (or fewer) than the rest of the race needs.
 */
export const fuelMeter = (fuel: number, full: number, spare: number): { fill: number; good: number; words: string } => ({
  fill: full > 0 ? fuel / full : 0,
  good: clamp01((spare + 0.5) / 1.5),
  words: spare >= 0.5 ? 'enough to finish' : spare >= 0 ? 'only just enough to finish' : 'not enough to finish',
});

/** Battery charge. */
export const batteryMeter = (charge: number): { fill: number; good: number; words: string } => {
  const share = clamp01(charge / 100);
  return { fill: share, good: share, words: share > 0.66 ? 'well charged' : share > 0.25 ? 'half charged' : 'nearly empty' };
};

/** Track wetness: empty and green when dry, full and red when flooded. */
export const wetMeter = (wetness: number): { fill: number; good: number } => ({ fill: clamp01(wetness), good: 1 - clamp01(wetness) });

/** Driver stress: empty and green when calm, full and red on the limit. */
export const stressMeter = (stress: number): { fill: number; good: number; words: string } => {
  const share = clamp01(stress / 100);
  return { fill: share, good: 1 - share, words: stress >= 70 ? 'on the limit' : stress >= 25 ? 'tense' : 'calm' };
};
