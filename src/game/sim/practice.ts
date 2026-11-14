/**
 * Practice: finding a setup.
 *
 * A setup is three dials. Each weekend there is a best position for each, depending on the
 * circuit and on the driver; nobody is told what it is. A run in practice brings the driver's
 * feedback on each dial, sharper from a driver who is consistent and gives good feedback. How
 * close the setup ends up decides how much of the car's pace is there in qualifying and the race.
 */
import { between, clamp, gaussian, seedFrom, type Luck } from './rng';
import type { SessionSetup } from './types';

export interface CarSetup {
  /** Wing angle: 0 for the least drag, 100 for the most downforce. */
  wing: number;
  /** Balance: 0 for a planted rear, 100 for a sharp front. */
  balance: number;
  /** Suspension: 0 soft, 100 stiff. */
  ride: number;
}

export const DIALS = ['wing', 'balance', 'ride'] as const;
export type Dial = (typeof DIALS)[number];

/** What the driver says about a dial: which way to go, or that it is right. */
export type Hint = 'much-lower' | 'lower' | 'good' | 'higher' | 'much-higher';

export const NEUTRAL_SETUP: CarSetup = { wing: 50, balance: 50, ride: 50 };

/**
 * The best setup for a driver at a circuit this weekend. The circuit sets the broad picture (wing
 * for the corners or for the straights), the driver his own taste, and the weekend the rest.
 */
export function idealSetup(seed: number, traits: SessionSetup['traits'], driverId: string): CarSetup {
  const weekend: Luck = { rng: seedFrom(seed, 'setup') };
  const taste: Luck = { rng: seedFrom(driverId, 'taste') };
  return {
    wing: clamp(50 + (traits.downforce - traits.power) * 9 + between(weekend, -8, 8), 5, 95),
    balance: clamp(50 + between(taste, -15, 15) + between(weekend, -8, 8), 5, 95),
    ride: clamp(50 + between(weekend, -22, 22) + between(taste, -6, 6), 5, 95),
  };
}

/** How good a setup is: 1 on the ideal, falling to 0 when it is far off on every dial. */
export function setupQuality(setup: CarSetup, ideal: CarSetup): number {
  let off = 0;
  for (const dial of DIALS) off += Math.abs(setup[dial] - ideal[dial]);
  return clamp(1 - off / 90, 0, 1);
}

/** How sharp a driver's feedback is, 0 to 1, from his consistency and any help from his engineer. */
export const feedbackPrecision = (consistency: number, engineer = 0): number =>
  clamp(consistency / 100 - 0.15 + engineer, 0.3, 0.97);

/**
 * The driver's verdict on each dial after a run. Within a few points of the ideal he calls it
 * good; his sense of how far off he is blurs as precision falls.
 */
export function setupFeedback(luck: Luck, setup: CarSetup, ideal: CarSetup, precision: number): Record<Dial, Hint> {
  const hint = (dial: Dial): Hint => {
    const felt = ideal[dial] - setup[dial] + gaussian(luck) * (1 - precision) * 12;
    if (Math.abs(felt) <= 4) return 'good';
    if (felt > 0) return felt > 15 ? 'much-higher' : 'higher';
    return felt < -15 ? 'much-lower' : 'lower';
  };
  return { wing: hint('wing'), balance: hint('balance'), ride: hint('ride') };
}

/** How well a team the simulation runs has its car set up by Sunday: better teams get closer. */
export function rivalSetupQuality(luck: Luck, teamStrength: number): number {
  return clamp(0.74 + (teamStrength / 100) * 0.1 + 0.13 * gaussian(luck), 0.4, 1);
}
