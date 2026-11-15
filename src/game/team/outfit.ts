/**
 * Running the team: setting it up, the turn of each season, what each Grand Prix pays and costs,
 * and the choices of the management phase. Every function takes an Outfit and returns a new one;
 * choices that can be refused return the reason in plain words instead.
 *
 * The rhythm is Golden Lap's. Between seasons: drivers and staff are signed, a customer team picks
 * its engine supplier, and the team signs a title sponsor. Between races: develop the car, put
 * money into next year's car, fit new power units, take on a sponsor challenge. After each Grand
 * Prix: the sponsor pays, salaries and the engine lease go out, and the power units wear.
 */
import { LAST_SEASON, calendar, rulesFor, teamsIn } from '../data';
import { between, clamp, seedFrom, type Luck } from '../sim/rng';
import type { Finish } from '../season/standings';
import { canBuild, freshParts, nextSeasonParts, partsIn, typicalSeason, withBuild, withUpgrade, buildCost, UPGRADE_GAIN } from './development';
import { academyYears } from './academy';
import { newWorld, realSeats, type World } from '../world';
import {
  contractFor,
  driverAsk,
  driverIn,
  freeAgents,
  marketDrivers,
  offerResponse,
  retiredBy,
  stintEnd,
  willTalk,
  type OfferResult,
} from './drivers';
import { customerMakers, engineLease, isWorks, realEngineOf } from './engines';
import { backersMoney, book, cappedSpend, money, prizeMoney, realPlaceBefore } from './money';
import { fitNew, freshUnits, replaceWorn, wearUnits } from './power-units';
import { challengeMet, challengeOffers, sponsorOffers, sponsorPay } from './sponsors';
import {
  STAFF_ROLES,
  ageStaff,
  aeroGain,
  designGain,
  newPartFragility,
  projectGain,
  staffAsk,
  staffPool,
  startingStaff,
  upgradeCost,
} from './staff';
import type { Outfit, PartId, StaffMember, StaffRole } from './types';

/** The career, as far as the team's business needs to know it. */
export interface TeamContext {
  /** The career's id: every bit of luck off the track is seeded from it. */
  id: string;
  team: string;
  season: number;
  /** The round whose management phase it is (or 1, before the season). */
  round: number;
  /** The drivers' world: who is lost, retired, made up. */
  world?: World;
  /** Between seasons (the winter market) rather than during one (free drivers only). */
  winter?: boolean;
}

export type Outcome = { ok: true; outfit: Outfit } | { ok: false; reason: string };

const ok = (outfit: Outfit): Outcome => ({ ok: true, outfit });
const no = (reason: string): Outcome => ({ ok: false, reason });

const luckOf = (ctx: TeamContext, ...parts: (string | number)[]): Luck => ({ rng: seedFrom(ctx.id, ctx.season, ...parts) });

// ── A new team ──────────────────────────────────────────────────────────────────────────────

/** The team as a career takes it over: its real drivers, staff its money buys, and the year's money. */
export function newOutfit(ctx: TeamContext): Outfit {
  const { team, season } = ctx;
  const seed = seedFrom(ctx.id, 'team');
  const fact = teamsIn(season).find((entry) => entry.team === team);
  const opening = fact?.drivers.filter((entry) => entry.rounds.includes(1)) ?? [];
  const lineup = [...opening, ...(fact?.drivers.filter((entry) => !opening.includes(entry)) ?? [])].slice(0, 2);
  const drivers = lineup.flatMap(({ id }) => {
    const entry = driverIn(id, season);
    if (!entry) return [];
    const length = clamp(stintEnd(id, team, season, LAST_SEASON) - season + 1, 1, 3);
    return [contractFor(entry, season, length)];
  });
  const standing = realPlaceBefore(team, season);
  let outfit: Outfit = {
    money: 0,
    ledger: [],
    sponsor: null,
    sponsorOffers: sponsorOffers(standing, season, seed),
    challenge: null,
    challengeOffers: challengeOffers(standing, null, season, 1, seed),
    drivers,
    staff: startingStaff(team, season, seed),
    engine: realEngineOf(team, season) ?? 'cosworth',
    parts: freshParts(team, season),
    nextYear: 0,
    units: [freshUnits(season), freshUnits(season)],
    penalties: [0, 0],
    capFactor: 1,
    preseason: ['sponsor'],
    market: null,
    lastPlace: null,
    news: [],
    academy: [],
    academyBonus: {},
  };
  outfit = book(outfit, 0, 'backers', "Backers' money", backersMoney(team, season));
  outfit = book(outfit, 0, 'prize', `Prize money for ${ordinalWord(standing)} in ${season - 1}`, prizeMoney(standing));
  return outfit;
}

const ordinalWord = (place: number): string => {
  const tail = place % 100 >= 11 && place % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][place % 10] ?? 'th');
  return `${place}${tail}`;
};

/** Whether the team builds its own power unit. */
export const worksTeam = (outfit: Outfit, team: string): boolean => isWorks(team, outfit.engine);

// ── The turn of the season ──────────────────────────────────────────────────────────────────

/** The budget cap's verdict on a season: the overspend, and what it costs. */
export function capVerdict(outfit: Outfit, season: number): { over: number; fine: number; factor: number } | null {
  const cap = rulesFor(season).budgetCap;
  if (cap === null) return null;
  const over = money(cappedSpend(outfit) - cap);
  if (over <= 0) return { over: 0, fine: 0, factor: 1 };
  const material = over > cap * 0.05;
  return { over, fine: money(over * (material ? 3 : 2)), factor: material ? 0.75 : 0.9 };
}

/**
 * From the last season to the next. `lastPlace` is the team's place in the teams' championship
 * just finished. Contracts that have run out wait to be renewed or replaced before the season can
 * start; so do the engine deal (for a customer team) and the sponsor.
 */
export function turnSeason(outfit: Outfit, ctx: TeamContext, lastPlace: number): Outfit {
  const { team, season } = ctx;
  const previous = season - 1;
  const news: string[] = [];
  const verdict = capVerdict(outfit, previous);
  const works = worksTeam(outfit, team);
  const parts = nextSeasonParts(outfit.parts, team, previous, outfit.nextYear, projectGain(outfit), works);
  const luck = luckOf(ctx, 'winter');
  const staff = outfit.staff.map((member) => ageStaff(member, luck));
  // A driver whose career is over retires when his contract runs out; one still under contract sees it out.
  const retired = outfit.drivers
    .filter((contract) => contract.until < season && retiredBy(contract.driver, season))
    .map((contract) => contract.driver);
  if (retired.length > 0) news.push(`retired:${retired.join(',')}`);
  const drivers = outfit.drivers.filter((contract) => !retired.includes(contract.driver));
  const preseason: Outfit['preseason'] = [];
  if (!contractsSettled({ ...outfit, drivers, staff }, season)) preseason.push('contracts');
  if (!works) preseason.push('engine');
  preseason.push('sponsor');
  const seed = seedFrom(ctx.id, 'team');
  let next: Outfit = {
    ...outfit,
    ledger: [],
    sponsor: null,
    sponsorOffers: sponsorOffers(lastPlace, season, seed),
    challenge: null,
    challengeOffers: challengeOffers(lastPlace, null, season, 1, seed),
    drivers,
    staff,
    parts,
    nextYear: 0,
    units: [freshUnits(season), freshUnits(season)],
    penalties: [0, 0],
    capFactor: verdict?.factor ?? 1,
    preseason,
    market: { season, staffPool: staffPool(season, seed), refused: [] },
    lastPlace,
    news: [...outfit.news, ...news],
  };
  next = book(next, 0, 'backers', "Backers' money", backersMoney(team, season));
  next = book(next, 0, 'prize', `Prize money for ${ordinalWord(lastPlace)} in ${previous}`, prizeMoney(lastPlace));
  if (verdict && verdict.fine > 0) {
    next = book(next, 0, 'fine', `Budget cap fine: ${previous} overspent by ${verdict.over}`, -verdict.fine);
    next.news.push(`cap:${verdict.over}:${verdict.factor}`);
  }
  return next;
}

/** Both seats and every role have someone under contract for the season. */
export function contractsSettled(outfit: Outfit, season: number): boolean {
  const seats = outfit.drivers.filter((contract) => contract.until >= season).length;
  const roles = new Set(outfit.staff.filter((member) => member.until >= season).map((member) => member.role));
  return seats >= 2 && STAFF_ROLES.every((role) => roles.has(role));
}

// ── After a Grand Prix ──────────────────────────────────────────────────────────────────────

/** What sets the next challenges: the team's place in the teams' championship, and the team just ahead. */
export interface Standing {
  place: number;
  rival: string | null;
}

/**
 * Settles a Grand Prix: the sponsor's money and any challenge reward, salaries, backers' money,
 * the engine lease, and the power units' wear. `raced` is each car's race wear in race distances,
 * in seat order.
 */
export function settleRace(
  outfit: Outfit,
  ctx: TeamContext,
  race: readonly Finish[],
  raced: readonly number[],
  standing: Standing,
): Outfit {
  const { team, season, round } = ctx;
  const rounds = calendar(season).length;
  let next: Outfit = { ...outfit };
  const news: string[] = [];
  const { sponsor, challenge } = outfit;
  if (sponsor) {
    const pay = sponsorPay(sponsor, race, team);
    next = book(next, round, 'sponsor', sponsor.name, pay.base);
    if (pay.bonus > 0) next = book(next, round, 'bonus', `${sponsor.name} bonus`, pay.bonus);
  }
  if (challenge) {
    const met = challengeMet(challenge, race, team);
    if (met) next = book(next, round, 'challenge', 'Sponsor challenge', challenge.reward);
    news.push(`challenge:${met ? 'met' : 'missed'}:${challenge.reward}`);
  }
  const salaries = next.drivers.reduce((sum, contract) => sum + contract.salary, 0);
  const backing = next.drivers.reduce((sum, contract) => sum + contract.backing, 0);
  next = book(next, round, 'drivers', "Drivers' salaries", -salaries / rounds);
  if (backing > 0) next = book(next, round, 'backing', "Drivers' backers", backing / rounds);
  const { inside, outside } = staffSalaries(next.staff);
  next = book(next, round, 'staff', 'Staff salaries', -outside / rounds);
  next = book(next, round, 'staff', 'Staff salaries (within the budget cap)', -inside / rounds, true);
  if (!worksTeam(next, team)) {
    next = book(next, round, 'engine-deal', `Engines from ${next.engine}`, -engineLease(next.engine, season) / rounds, true);
  }
  const fees = next.academy.reduce((sum, junior) => sum + junior.fee, 0);
  if (fees > 0) next = book(next, round, 'academy', 'Junior academy', -fees / rounds);
  const units = next.units.map((unit, seat) => wearUnits(unit, raced[seat] ?? 1, season));
  const penalties = [0, 0];
  for (let seat = 0; seat < units.length; seat++) {
    if (round === rounds) break;
    const result = replaceWorn(units[seat]!, season);
    units[seat] = result.unit;
    penalties[seat] = result.places;
    for (const kind of result.fitted) news.push(`unit:${seat}:${kind}:${result.places}`);
  }
  next = {
    ...next,
    units,
    penalties,
    challenge: null,
    challengeOffers: round < rounds ? challengeOffers(standing.place, standing.rival, season, round + 1, seedFrom(ctx.id, 'team')) : [],
    news: [...next.news, ...news],
  };
  return next;
}

/** Wear from a sprint, in race distances, in seat order. Settled when the sprint ends. */
export const settleSprint = (outfit: Outfit, raced: readonly number[]): Outfit => ({
  ...outfit,
  units: outfit.units.map((unit) => ({ ...unit })).map((unit, seat) => ({
    ...unit,
    engineWear: unit.engineWear + Math.max(0, raced[seat] ?? 0),
    batteryWear: unit.batteries > 0 ? unit.batteryWear + Math.max(0, raced[seat] ?? 0) : 0,
  })),
});

/** Staff salaries for a season: the three best paid sit outside the budget cap, the rest inside. */
export function staffSalaries(staff: readonly StaffMember[]): { inside: number; outside: number } {
  const sorted = staff.map((member) => member.salary).sort((a, b) => b - a);
  const outside = sorted.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const inside = sorted.slice(3).reduce((sum, value) => sum + value, 0);
  return { inside: money(inside), outside: money(outside) };
}

// ── The management phase ────────────────────────────────────────────────────────────────────

/** Room left under the budget cap this season; null when there is no cap. */
export function capRoom(outfit: Outfit, season: number): number | null {
  const cap = rulesFor(season).budgetCap;
  return cap === null ? null : money(cap - cappedSpend(outfit));
}

/** What a new version of a part is expected to gain, before luck. */
export const expectedGain = (outfit: Outfit, part: PartId): number =>
  designGain(outfit) * (part === 'aero' ? aeroGain(outfit) : 1) * outfit.capFactor;

/** Builds a new version of a part. Its gain is expected ± half, by luck. */
export function buildPart(outfit: Outfit, ctx: TeamContext, part: PartId): Outcome {
  const state = outfit.parts[part];
  if (!state || !partsIn(ctx.season).includes(part)) return no('This car has no such part.');
  if (!canBuild(part, ctx.season, worksTeam(outfit, ctx.team))) return no('This part cannot be rebuilt by the team.');
  const cost = buildCost(part, state.builds);
  if (outfit.money < cost) return no(`Not enough money: a new ${part} costs ${cost}.`);
  const gain = expectedGain(outfit, part) * between(luckOf(ctx, ctx.round, part, state.builds), 0.5, 1.5);
  const built = withBuild(state, gain, newPartFragility(outfit));
  const next = book({ ...outfit, parts: { ...outfit.parts, [part]: built } }, ctx.round, 'part', `New ${part}`, -cost, true);
  return ok({ ...next, news: [...next.news, `built:${part}:${money(gain)}`] });
}

/** Upgrades a part: a little pace, and reliability back. */
export function upgradePart(outfit: Outfit, ctx: TeamContext, part: PartId): Outcome {
  const state = outfit.parts[part];
  if (!state || !partsIn(ctx.season).includes(part)) return no('This car has no such part.');
  const cost = upgradeCost(outfit);
  if (outfit.money < cost) return no(`Not enough money: an upgrade costs ${cost}.`);
  const upgraded = withUpgrade(state, UPGRADE_GAIN * designGain(outfit) * outfit.capFactor);
  return ok(book({ ...outfit, parts: { ...outfit.parts, [part]: upgraded } }, ctx.round, 'part', `Upgraded ${part}`, -cost, true));
}

/** Puts money into next season's car. Not possible in the last season of the game. */
export function investNextYear(outfit: Outfit, ctx: TeamContext, amount: number): Outcome {
  if (ctx.season >= LAST_SEASON) return no('There is no next season to build for.');
  if (amount <= 0) return no('Choose an amount to put in.');
  if (outfit.money < amount) return no('Not enough money.');
  const next = book({ ...outfit, nextYear: money(outfit.nextYear + amount) }, ctx.round, 'next-year', `Next year's car`, -amount, true);
  return ok(next);
}

/** Fits a new engine or battery to a car before the next weekend: past the allowance it costs grid places. */
export function fitUnit(outfit: Outfit, ctx: TeamContext, seat: number, kind: 'engine' | 'battery'): Outcome {
  const unit = outfit.units[seat];
  if (!unit) return no('No such car.');
  if (kind === 'battery' && rulesFor(ctx.season).batteryAllowance === null) return no('These cars have no battery to change.');
  const result = fitNew(unit, kind, ctx.season);
  const units = outfit.units.map((current, index) => (index === seat ? result.unit : current));
  const penalties = outfit.penalties.map((places, index) => (index === seat ? places + result.places : places));
  return ok({ ...outfit, units, penalties });
}

/** Takes on one of the sponsor's challenges for the next Grand Prix, in place of any other. */
export function takeChallenge(outfit: Outfit, id: string | null): Outcome {
  if (id === null) return ok({ ...outfit, challenge: null });
  const offer = outfit.challengeOffers.find((candidate) => candidate.id === id);
  return offer ? ok({ ...outfit, challenge: offer }) : no('That challenge is not on offer.');
}

// ── Between seasons ─────────────────────────────────────────────────────────────────────────

const done = (outfit: Outfit, step: Outfit['preseason'][number]): Outfit => ({
  ...outfit,
  preseason: outfit.preseason.filter((candidate) => candidate !== step),
});

export function chooseSponsor(outfit: Outfit, id: string): Outcome {
  const deal = outfit.sponsorOffers.find((offer) => offer.id === id);
  if (!deal) return no('That sponsor is not on offer.');
  return ok(done({ ...outfit, sponsor: deal, sponsorOffers: [] }, 'sponsor'));
}

/** A customer team's engine supplier for the season. */
export function chooseEngine(outfit: Outfit, ctx: TeamContext, maker: string): Outcome {
  if (worksTeam(outfit, ctx.team)) return no('A works team builds its own engines.');
  if (!customerMakers(ctx.season).includes(maker)) return no('That maker is not selling engines this season.');
  return ok(done({ ...outfit, engine: maker }, 'engine'));
}

/** The team's standing for the market: last season's place, or where its real car ranked. */
export const standingOf = (outfit: Outfit, team: string, season: number): number => outfit.lastPlace ?? realPlaceBefore(team, season);

/** Drivers whose contracts are current for the season, and those that have run out. */
export function contractStatus(outfit: Outfit, season: number): { current: string[]; expired: string[] } {
  return {
    current: outfit.drivers.filter((contract) => contract.until >= season).map((contract) => contract.driver),
    expired: outfit.drivers.filter((contract) => contract.until < season).map((contract) => contract.driver),
  };
}

/**
 * The drivers the team can sign: between seasons, the winter market; during a season, after a loss,
 * only drivers without a seat.
 */
export function driverMarket(outfit: Outfit, ctx: TeamContext) {
  const { current, expired } = contractStatus(outfit, ctx.season);
  const world = ctx.world ?? newWorld();
  const academy = outfit.academy.map((junior) => junior.driver);
  if (ctx.winter === false) {
    const held = new Set([...current, ...academy]);
    return freeAgents(ctx.season, realSeats(ctx.season), world, held);
  }
  return marketDrivers(ctx.season, ctx.team, current, expired, world, academy);
}

/** Once every seat and role is signed for the season, the contracts step is done: lapsed deals are let go. */
function settle(outfit: Outfit, season: number): Outfit {
  if (!contractsSettled(outfit, season)) return outfit;
  return done(
    {
      ...outfit,
      drivers: outfit.drivers.filter((contract) => contract.until >= season).slice(0, 2),
      staff: outfit.staff.filter((member) => member.until >= season),
    },
    'contracts',
  );
}

/**
 * Offers a driver a contract. `lower` offers 85% of his asking salary instead of all of it. On
 * signing he takes the seat of a driver whose contract has run out (or `seat`, if given).
 */
export function offerDriver(
  outfit: Outfit,
  ctx: TeamContext,
  driver: string,
  length: number,
  lower: boolean,
): { result: OfferResult | 'no-seat' | 'unknown'; outfit: Outfit } {
  const entry = driverIn(driver, ctx.season);
  const listed = driverMarket(outfit, ctx).find((candidate) => candidate.driver === driver);
  if (!entry || !listed) return { result: 'unknown', outfit };
  const { current } = contractStatus(outfit, ctx.season);
  if (current.length >= 2) return { result: 'no-seat', outfit };
  const ask = driverAsk(entry, length);
  const offer = lower ? money(ask * 0.85) : ask;
  const refused = outfit.market?.refused ?? [];
  const result = offerResponse(driver, entry.overall, standingOf(outfit, ctx.team, ctx.season), offer, ask, refused, seedFrom(ctx.id, ctx.season));
  if (result === 'refused' && outfit.market) {
    return { result, outfit: { ...outfit, market: { ...outfit.market, refused: [...refused, driver] } } };
  }
  if (result !== 'signed') return { result, outfit };
  const contract = contractFor(entry, ctx.season, length, offer);
  // A junior stepping up from the academy takes its years there along.
  const years = academyYears(outfit, driver, ctx.season);
  const graduated: Outfit =
    years > 0 || outfit.academy.some((junior) => junior.driver === driver)
      ? {
          ...outfit,
          academy: outfit.academy.filter((junior) => junior.driver !== driver),
          academyBonus: { ...outfit.academyBonus, [driver]: years },
        }
      : outfit;
  // A driver renewing keeps his seat; a new one takes the next free seat.
  const at = graduated.drivers.findIndex((candidate) => candidate.driver === driver);
  const drivers = graduated.drivers.filter((candidate) => candidate.driver !== driver);
  if (at >= 0) drivers.splice(at, 0, contract);
  else drivers.push(contract);
  return { result, outfit: settle({ ...graduated, drivers }, ctx.season) };
}

/** Lets a driver whose contract has run out go, freeing his seat. */
export function releaseDriver(outfit: Outfit, ctx: TeamContext, driver: string): Outcome {
  const contract = outfit.drivers.find((candidate) => candidate.driver === driver);
  if (!contract) return no('Not one of your drivers.');
  if (contract.until >= ctx.season) return no('Under contract for this season.');
  return ok({ ...outfit, drivers: outfit.drivers.filter((candidate) => candidate.driver !== driver) });
}

/**
 * Staff: what someone asks for a contract with the team. Someone renewing keeps their salary, as in
 * Golden Lap, however much they have improved; a demanding one asks their market rate (with its
 * premium) if that is more.
 */
export function staffOfferAsk(outfit: Outfit, member: StaffMember): number {
  const renewing = outfit.staff.some((current) => current.id === member.id);
  const market = staffAsk(member.skill, member.traits);
  if (!renewing) return market;
  return member.traits.includes('demanding') ? Math.max(member.salary, market) : member.salary;
}

/** Offers someone a contract: from the pool, or one of the team's own whose contract has run out. */
export function offerStaff(
  outfit: Outfit,
  ctx: TeamContext,
  id: string,
  length: number,
  lower: boolean,
): { result: OfferResult | 'unknown'; outfit: Outfit } {
  const own = outfit.staff.find((member) => member.id === id);
  const pooled = outfit.market?.staffPool.find((member) => member.id === id);
  const member = own ?? pooled;
  if (!member || (own && own.until >= ctx.season)) return { result: 'unknown', outfit };
  const ask = staffOfferAsk(outfit, member);
  const offer = lower ? money(ask * 0.85) : ask;
  const refused = outfit.market?.refused ?? [];
  const result = offerResponse(id, member.skill, standingOf(outfit, ctx.team, ctx.season), offer, ask, refused, seedFrom(ctx.id, ctx.season));
  if (result === 'refused' && outfit.market) {
    return { result, outfit: { ...outfit, market: { ...outfit.market, refused: [...refused, id] } } };
  }
  if (result !== 'signed') return { result, outfit };
  const signed: StaffMember = { ...member, salary: offer, until: ctx.season + length - 1 };
  const staff = [...outfit.staff.filter((current) => current.role !== member.role), signed];
  const market = outfit.market && { ...outfit.market, staffPool: outfit.market.staffPool.filter((candidate) => candidate.id !== id) };
  return { result, outfit: settle({ ...outfit, staff: sortStaff(staff), market }, ctx.season) };
}

const sortStaff = (staff: StaffMember[]): StaffMember[] =>
  [...staff].sort((a, b) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role));

/** Someone in a role, if their contract covers the season. */
export const staffIn = (outfit: Outfit, role: StaffRole, season: number): StaffMember | undefined =>
  outfit.staff.find((member) => member.role === role && member.until >= season);

// ── Choices made for the player ─────────────────────────────────────────────────────────────

/**
 * Settles the winter's business the way the real team did, where it can: the drivers who really
 * drove for it that season, otherwise its own drivers renewed, otherwise the best it can afford;
 * staff renewed unless the market has clearly better; the same engine; the balanced sponsor. For
 * a player who skips ahead, and for tests.
 */
export function autoPreseason(outfit: Outfit, ctx: TeamContext): Outfit {
  let next = outfit;
  if (next.preseason.includes('contracts')) {
    const typical = typicalSeason(ctx.team, ctx.season);
    // Staff: renew, unless the market has someone clearly better who fits the money.
    const staffBudget = Math.max(1.5, (typical.staff / 5) * 1.5);
    for (const role of STAFF_ROLES) {
      if (staffIn(next, role, ctx.season)) continue;
      const pool = (next.market?.staffPool ?? []).filter((member) => member.role === role);
      const best = [...pool].sort((a, b) => b.skill - a.skill).find((member) => staffAsk(member.skill, member.traits) <= staffBudget);
      const mine = next.staff.find((member) => member.role === role);
      if (mine && (!best || mine.skill >= best.skill - 10)) next = offerStaff(next, ctx, mine.id, 2, false).outfit;
      if (staffIn(next, role, ctx.season)) continue;
      const choice = best ?? [...pool].sort((a, b) => a.salary - b.salary)[0];
      if (choice) next = offerStaff(next, ctx, choice.id, 2, false).outfit;
    }
    // Drivers: the ones who really drove for the team this season, where they can be had; then
    // renew; then the best who will talk and fits the money.
    const real = teamsIn(ctx.season).find((entry) => entry.team === ctx.team)?.drivers.slice(0, 2) ?? [];
    const market = driverMarket(next, ctx);
    for (const { id } of real) {
      if (contractStatus(next, ctx.season).current.length >= 2) break;
      if (market.some((candidate) => candidate.driver === id)) next = offerDriver(next, ctx, id, 1, false).outfit;
    }
    for (const contract of [...next.drivers]) {
      if (contract.until >= ctx.season || contractStatus(next, ctx.season).current.length >= 2) continue;
      next = offerDriver(next, ctx, contract.driver, 2, false).outfit;
    }
    const budget = Math.max(3, typical.drivers / 2 + 2);
    for (const candidate of driverMarket(next, ctx)) {
      if (contractStatus(next, ctx.season).current.length >= 2) break;
      if (candidate.ask - candidate.backing > budget) continue;
      if (!willTalk(candidate.overall, standingOf(next, ctx.team, ctx.season))) continue;
      next = offerDriver(next, ctx, candidate.driver, 2, false).outfit;
    }
    next = settle(next, ctx.season);
  }
  if (next.preseason.includes('engine')) {
    const makers = customerMakers(ctx.season);
    const maker = makers.includes(next.engine) ? next.engine : (realEngineOf(ctx.team, ctx.season) ?? makers[0]!);
    const chosen = chooseEngine(next, ctx, makers.includes(maker) ? maker : makers[0]!);
    if (chosen.ok) next = chosen.outfit;
  }
  if (next.preseason.includes('sponsor')) {
    const balanced = next.sponsorOffers.find((offer) => offer.tier === 'balanced') ?? next.sponsorOffers[0];
    if (balanced) {
      const chosen = chooseSponsor(next, balanced.id);
      if (chosen.ok) next = chosen.outfit;
    }
  }
  return next;
}

/**
 * A management phase spent the way the real team spent: this round's share of a typical season's
 * development, on the cheapest new parts (the one furthest behind first), upgrades for parts gone
 * fragile, and its share of the typical work on next year's car, within the money there is and the
 * budget cap. Takes the first challenge on offer.
 */
export function autoManage(outfit: Outfit, ctx: TeamContext): Outfit {
  const typical = typicalSeason(ctx.team, ctx.season);
  const rounds = calendar(ctx.season).length;
  let next = outfit;
  const share = (total: number): number => (total * ctx.round) / rounds;
  const spentOn = (kind: 'part' | 'next-year'): number =>
    -next.ledger.filter((entry) => entry.kind === kind).reduce((sum, entry) => sum + entry.amount, 0);
  const room = (): number => Math.min(next.money, capRoom(next, ctx.season) ?? Infinity);
  const buildable = partsIn(ctx.season).filter((part) => canBuild(part, ctx.season, worksTeam(next, ctx.team)));
  for (let guard = 0; guard < 20 && buildable.length > 0; guard++) {
    // The cheapest new part, and of equally cheap ones, the part furthest behind.
    const cheapest = [...buildable].sort(
      (a, b) => buildCost(a, next.parts[a]!.builds) - buildCost(b, next.parts[b]!.builds) || next.parts[a]!.perf - next.parts[b]!.perf,
    )[0]!;
    const cost = buildCost(cheapest, next.parts[cheapest]!.builds);
    if (spentOn('part') + cost > share(typical.development) + cost / 2 || cost > room()) break;
    const built = buildPart(next, ctx, cheapest);
    if (!built.ok) break;
    next = built.outfit;
  }
  // Fragile parts get an upgrade to bring their reliability back.
  for (const part of partsIn(ctx.season)) {
    if ((next.parts[part]?.rel ?? 0) > -4 || upgradeCost(next) > room()) continue;
    const upgraded = upgradePart(next, ctx, part);
    if (upgraded.ok) next = upgraded.outfit;
  }
  const project = Math.min(share(typical.nextYear) - spentOn('next-year'), room());
  if (project >= 1 && ctx.season < LAST_SEASON) {
    const invested = investNextYear(next, ctx, money(project));
    if (invested.ok) next = invested.outfit;
  }
  if (!next.challenge && next.challengeOffers[0]) next = { ...next, challenge: next.challengeOffers[0] };
  return { ...next, news: [] };
}

/** Grid places to drop at the next Grand Prix, by driver. */
export function gridPenalties(outfit: Outfit): Record<string, number> {
  const out: Record<string, number> = {};
  outfit.drivers.forEach((contract, seat) => {
    if (outfit.penalties[seat]) out[contract.driver] = outfit.penalties[seat]!;
  });
  return out;
}

