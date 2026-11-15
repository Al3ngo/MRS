/**
 * The junior academy (the brief: "sign young drivers and develop them"). Up to three drivers aged
 * 15 to 19: made-up prospects, or real drivers before their real debut. They grow up as their age
 * says, and each full season in the academy adds a point to every rating (three at most) once they
 * race for the team. Old enough to race (17, and 18 from 2016), a junior can be signed to a race
 * seat between seasons. Each costs a fee a season, more for more potential, outside the budget cap.
 */
import { money } from './money';
import type { Outfit } from './types';
import { potentialOf, prospects, type World } from '../world';

export const ACADEMY_PLACES = 3;
export const ACADEMY_BONUS_MOST = 3;

/** A junior's fee a season: 1, up to 3.5 for the brightest prospect. */
export const academyFee = (driver: string): number => money(1 + Math.max(0, Math.min(2.5, (potentialOf(driver) - 72) / 8)));

/** Everyone the team holds in a season: drivers under contract for it, and the academy. */
export function heldBy(outfit: Outfit | null, season: number): Set<string> {
  if (!outfit) return new Set();
  return new Set([
    ...outfit.drivers.filter((contract) => contract.until >= season).map((contract) => contract.driver),
    ...outfit.academy.map((junior) => junior.driver),
  ]);
}

/** Young drivers the team could sign to its academy this season. */
export const academyProspects = (outfit: Outfit, world: World, season: number) => prospects(world, season, heldBy(outfit, season));

export function signJunior(outfit: Outfit, world: World, season: number, driver: string): { ok: true; outfit: Outfit } | { ok: false; reason: string } {
  if (outfit.academy.length >= ACADEMY_PLACES) return { ok: false, reason: `The academy has room for ${ACADEMY_PLACES}.` };
  if (!academyProspects(outfit, world, season).some((entry) => entry.driver.id === driver)) return { ok: false, reason: 'That driver is not available.' };
  return { ok: true, outfit: { ...outfit, academy: [...outfit.academy, { driver, since: season, fee: academyFee(driver) }] } };
}

export function releaseJunior(outfit: Outfit, driver: string): { ok: true; outfit: Outfit } | { ok: false; reason: string } {
  if (!outfit.academy.some((junior) => junior.driver === driver)) return { ok: false, reason: 'Not in your academy.' };
  return { ok: true, outfit: { ...outfit, academy: outfit.academy.filter((junior) => junior.driver !== driver) } };
}

/** What a junior's time in the academy is worth when they step up: a point a full season, three at most. */
export const academyYears = (outfit: Outfit, driver: string, season: number): number => {
  const junior = outfit.academy.find((entry) => entry.driver === driver);
  return junior ? Math.min(ACADEMY_BONUS_MOST, Math.max(0, season - junior.since)) : 0;
};
