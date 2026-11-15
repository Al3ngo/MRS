/**
 * Where the money comes from, and the books it is kept in.
 *
 * A season's income has four sources, as in the real sport: the team's backers (owners, a car maker,
 * the commercial rights it holds), prize money for last season's place in the teams' championship,
 * the title sponsor, and the backers some drivers bring. The backers' share is set so that a team
 * finishing where it really finished, with the sponsor its standing earns, has the real team's
 * spending power (see teamSpending). Doing better than history earns more; worse, less.
 */
import { REAL_PACE, calendar, rulesFor, teamSpending, teamsIn } from '../data';
import type { LedgerEntry, LedgerKind, Outfit } from './types';

/** Money is kept to one decimal place (and never as a negative zero, which a save would not keep). */
export const money = (value: number): number => Math.round(value * 10) / 10 + 0;

/** Prize money for a place in the teams' championship, paid at the start of the next season. */
const PRIZE = [40, 36, 32, 29, 26, 23, 20, 17, 14, 11, 8, 6, 4, 3] as const;

export const prizeMoney = (place: number): number => PRIZE[place - 1] ?? 2;

/**
 * The 2009 teams' championship, which sets the prize money and sponsor standing a career starts
 * with. Mercedes bought the champion Brawn team; BMW Sauber became Sauber. The three new teams of
 * 2010 had no place.
 */
const PLACES_2009: Readonly<Record<string, number>> = {
  mercedes: 1,
  'red-bull': 2,
  mclaren: 3,
  ferrari: 4,
  sauber: 6,
  williams: 7,
  renault: 8,
  'force-india': 9,
  'toro-rosso': 10,
};

/** Where a team's real car ranked on pace in a season: its expected place. Teams not racing that year come last. */
export function expectedPlace(team: string, season: number): number {
  const teams = teamsIn(season);
  const pace = REAL_PACE[season] ?? {};
  const order = [...teams].sort((a, b) => (pace[a.team]?.gap ?? 99) - (pace[b.team]?.gap ?? 99) || a.team.localeCompare(b.team));
  const index = order.findIndex((entry) => entry.team === team);
  return index === -1 ? teams.length + 1 : index + 1;
}

/** Where the real team finished the season before: from the record for 2009, from real pace after. */
export function realPlaceBefore(team: string, season: number): number {
  if (season === 2010) return PLACES_2009[team] ?? teamsIn(2010).length + 1;
  return expectedPlace(team, season - 1);
}

/**
 * What a team can spend in a season, all in: before 2021 its spending power; from 2021 that power
 * up to the budget cap plus room for the salaries the cap leaves out (drivers, top staff).
 */
export function seasonIncome(team: string, season: number): number {
  const cap = rulesFor(season).budgetCap;
  const spending = teamSpending(team, season);
  return cap === null ? spending : Math.min(spending, cap + 45);
}

/** What a title sponsor pays per Grand Prix at a standing, before choosing between steady and bold. */
export const sponsorScale = (standing: number): number => 0.9 + (2.7 * Math.max(0, 12 - standing)) / 11;

/**
 * What the sponsor usually brings over a season at a standing: a balanced deal (its bonus earned a
 * little over half the time) and the challenges a team usually wins.
 */
export const sponsorExpected = (standing: number, season: number): number =>
  calendar(season).length * (sponsorScale(standing) + 0.7);

/** The backers' money for a season: the rest of the real team's spending power. */
export function backersMoney(team: string, season: number): number {
  const before = realPlaceBefore(team, season);
  return money(Math.max(5, seasonIncome(team, season) - prizeMoney(before) - sponsorExpected(before, season)));
}

/** Books a movement of money. Returns a new outfit. */
export function book(
  outfit: Outfit,
  round: number,
  kind: LedgerKind,
  label: string,
  amount: number,
  capped = false,
): Outfit {
  const entry: LedgerEntry = { round, kind, label, amount: money(amount), capped };
  return { ...outfit, money: money(outfit.money + entry.amount), ledger: [...outfit.ledger, entry] };
}

/** Money spent this season that counts against the budget cap. */
export const cappedSpend = (outfit: Outfit): number =>
  money(-outfit.ledger.filter((entry) => entry.capped).reduce((sum, entry) => sum + entry.amount, 0));

/** This season's money by kind: what came in and what went out. */
export function ledgerTotals(outfit: Outfit): Partial<Record<LedgerKind, number>> {
  const totals: Partial<Record<LedgerKind, number>> = {};
  for (const entry of outfit.ledger) totals[entry.kind] = money((totals[entry.kind] ?? 0) + entry.amount);
  return totals;
}
