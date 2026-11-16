/**
 * Stage 6: the team off the track. Money, sponsors and challenges; staff, drivers, contracts and
 * the market; engines; development and next year's car; power units; the budget cap; and how it
 * all runs through a career.
 */
import { describe, expect, it } from 'vitest';
import { chooseTeam, finishManagement, newCareer, withOutfit, type CareerState } from '../src/game/career';
import { rulesFor } from '../src/game/data';
import { MIGRATIONS } from '../src/game/save-schema';
import { roundEntrants } from '../src/game/season/grid';
import { applyPenalties, autoplay } from '../src/game/season/sessions';
import type { Finish } from '../src/game/season/standings';
import type { Entrant } from '../src/game/sim/types';
import {
  backersMoney,
  buildCost,
  buildPart,
  canBuild,
  capVerdict,
  challengeMet,
  challengeOffers,
  chooseSponsor,
  contractsSettled,
  customerMakers,
  driverAsk,
  driverIn,
  driverMarket,
  engineLease,
  engineStrength,
  expectedPlace,
  fitNew,
  freshParts,
  freshUnits,
  investNextYear,
  isWorks,
  marketDrivers,
  newOutfit,
  nextSeasonParts,
  offerDriver,
  offerResponse,
  partsIn,
  penaltyForUnit,
  playerCar,
  prizeMoney,
  projectEffect,
  raceEngineAge,
  realPlaceBefore,
  replaceWorn,
  retiredBy,
  seasonIncome,
  settleRace,
  sponsorExpected,
  sponsorOffers,
  sponsorPay,
  staffAsk,
  staffOfferAsk,
  startingStaff,
  turnSeason,
  typicalSeason,
  unitLife,
  upgradePart,
  willTalk,
  withBuild,
  withUpgrade,
  type Challenge,
  type Outfit,
  type TeamContext,
} from '../src/game/team';

const ctx = (team: string, season: number, round = 1): TeamContext => ({ id: 'test-career', team, season, round });

const finish = (driver: string, team: string, position: number, grid = position, classified = true): Finish => ({
  driver,
  team,
  position,
  points: 0,
  classified,
  status: classified ? 'Finished' : 'Accident',
  grid,
  fastestLap: false,
});

describe('money', () => {
  it('pays prize money by place, most for the champions', () => {
    for (let place = 2; place <= 14; place++) expect(prizeMoney(place)).toBeLessThan(prizeMoney(place - 1));
    expect(prizeMoney(1)).toBe(40);
    expect(prizeMoney(20)).toBe(2);
  });

  it("gives a team that finishes where it really finished its real spending power", () => {
    for (const [team, season] of [['ferrari', 2010], ['williams', 2014], ['hrt', 2010], ['mercedes', 2021]] as const) {
      const before = realPlaceBefore(team, season);
      const total = backersMoney(team, season) + prizeMoney(before) + sponsorExpected(before, season);
      expect(total, `${team} ${season}`).toBeCloseTo(seasonIncome(team, season), 0);
    }
    // The backers always put in something, even when sponsors and prize money would cover it all.
    expect(backersMoney('hrt', 2011)).toBe(5);
  });

  it('keeps big budgets near the cap from 2021, and leaves small teams below it', () => {
    expect(seasonIncome('ferrari', 2020)).toBe(230);
    expect(seasonIncome('ferrari', 2021)).toBe(145 + 45);
    expect(seasonIncome('ferrari', 2023)).toBe(135 + 45);
    expect(seasonIncome('williams', 2021)).toBeLessThan(145);
    expect(expectedPlace('mercedes', 2014)).toBe(1);
    expect(expectedPlace('hrt', 2014)).toBe(12);
  });
});

describe('sponsors', () => {
  const offers = sponsorOffers(5, 2015, 1);

  it('offers a steady, a balanced and a bold deal', () => {
    expect(offers.map((offer) => offer.tier)).toEqual(['steady', 'balanced', 'bold']);
    const [steady, balanced, bold] = offers as [typeof offers[0], typeof offers[0], typeof offers[0]];
    expect(steady.base).toBeGreaterThan(balanced.base);
    expect(balanced.base).toBeGreaterThan(bold.base);
    expect(bold.bonus).toBeGreaterThan(balanced.bonus);
    expect(bold.target).toBeLessThan(steady.target);
    expect(new Set(offers.map((offer) => offer.name)).size).toBe(3);
  });

  it('pays the bonus only when a car reaches the target', () => {
    const deal = offers[1]!;
    const hit = sponsorPay(deal, [finish('a', 'us', deal.target), finish('b', 'us', 20)], 'us');
    const miss = sponsorPay(deal, [finish('a', 'us', deal.target + 1), finish('b', 'them', 1)], 'us');
    expect(hit).toEqual({ base: deal.base, bonus: deal.bonus });
    expect(miss).toEqual({ base: deal.base, bonus: 0 });
  });

  it('offers richer deals to a team that did better', () => {
    expect(sponsorOffers(1, 2015, 1)[1]!.base).toBeGreaterThan(sponsorOffers(10, 2015, 1)[1]!.base);
  });

  it('sets three different challenges, fitted to the team', () => {
    const front = challengeOffers(1, 'mercedes', 2015, 5, 3);
    expect(new Set(front.map((offer) => offer.kind)).size).toBe(front.length);
    expect(front.length).toBe(3);
    // A backmarker is never asked to get both cars into the points.
    for (let seed = 0; seed < 20; seed++) {
      expect(challengeOffers(11, 'manor', 2015, 5, seed).some((offer) => offer.kind === 'both-points')).toBe(false);
    }
  });

  it('judges each kind of challenge from the result', () => {
    const race = [finish('x', 'them', 1), finish('a', 'us', 3, 9), finish('y', 'them', 4), finish('b', 'us', 12, 2)];
    const check = (challenge: Omit<Challenge, 'id'>) => challengeMet({ ...challenge, id: 'c' }, race, 'us');
    expect(check({ kind: 'car-top', target: 3, rival: null, reward: 1 })).toBe(true);
    expect(check({ kind: 'car-top', target: 2, rival: null, reward: 1 })).toBe(false);
    expect(check({ kind: 'both-points', target: 10, rival: null, reward: 1 })).toBe(false);
    expect(check({ kind: 'gain-places', target: 5, rival: null, reward: 1 })).toBe(true);
    expect(check({ kind: 'beat-team', target: 0, rival: 'them', reward: 1 })).toBe(false);
    expect(check({ kind: 'both-finish', target: 0, rival: null, reward: 1 })).toBe(true);
    expect(check({ kind: 'grid-top', target: 2, rival: null, reward: 1 })).toBe(true);
  });
});

describe('staff', () => {
  it('fills every role, better at richer teams', () => {
    const rich = startingStaff('ferrari', 2010, 1);
    const poor = startingStaff('hrt', 2010, 1);
    expect(rich.map((member) => member.role)).toEqual(['technical-director', 'aerodynamicist', 'race-engineer', 'strategist', 'pit-crew-chief']);
    const mean = (staff: typeof rich) => staff.reduce((sum, member) => sum + member.skill, 0) / staff.length;
    expect(mean(rich)).toBeGreaterThan(mean(poor) + 20);
    for (const member of [...rich, ...poor]) {
      expect(member.traits.length).toBeLessThanOrEqual(2);
      expect(member.traits.includes('rising') && member.traits.includes('veteran')).toBe(false);
    }
  });

  it('asks more for more skill: about 7 a season for the very best', () => {
    expect(staffAsk(95, [])).toBeCloseTo(7, 0);
    expect(staffAsk(50, [])).toBeLessThan(staffAsk(80, []));
    expect(staffAsk(80, ['demanding'])).toBeCloseTo(staffAsk(80, []) * 1.3, 0);
  });

  it('keeps a renewing member on the same salary; a demanding one asks the going rate, without compounding', () => {
    const outfit = newOutfit(ctx('ferrari', 2010));
    const member = { ...outfit.staff[0]!, skill: 90, salary: 2, traits: [] };
    const demanding = { ...member, traits: ['demanding' as const] };
    const own = { ...outfit, staff: [member, ...outfit.staff.slice(1)] };
    expect(staffOfferAsk(own, member)).toBe(2);
    const ownDemanding = { ...outfit, staff: [demanding, ...outfit.staff.slice(1)] };
    expect(staffOfferAsk(ownDemanding, demanding)).toBe(staffAsk(90, ['demanding']));
    const raised = { ...demanding, salary: staffAsk(90, ['demanding']) };
    expect(staffOfferAsk({ ...outfit, staff: [raised, ...outfit.staff.slice(1)] }, raised)).toBe(raised.salary);
  });
});

describe('drivers and the market', () => {
  it('prices the best driver in the twenties, a beginner under one', () => {
    expect(driverAsk(driverIn('fernando-alonso', 2010)!)).toBeGreaterThan(20);
    expect(driverAsk(driverIn('fernando-alonso', 2010)!)).toBeLessThan(30);
    expect(driverAsk(driverIn('narain-karthikeyan', 2011)!)).toBeLessThan(1.5);
  });

  it('lists movers and rookies, not drivers who stayed put, and not long absentees', () => {
    const market = marketDrivers(2011, 'williams', [], []).map((entry) => entry.driver);
    expect(market).toContain('nick-heidfeld');
    expect(market).toContain('pastor-maldonado');
    expect(market).not.toContain('sebastian-vettel');
    expect(market).not.toContain('lewis-hamilton');
    expect(marketDrivers(2013, 'williams', [], []).map((entry) => entry.driver)).not.toContain('robert-kubica');
    expect(marketDrivers(2013, 'williams', [], []).map((entry) => entry.driver)).toContain('lewis-hamilton');
    // Retired in reality: gone, even straight after his last season.
    expect(marketDrivers(2013, 'williams', [], []).map((entry) => entry.driver)).not.toContain('michael-schumacher');
  });

  it('knows who retired', () => {
    expect(retiredBy('michael-schumacher', 2013)).toBe(true);
    expect(retiredBy('nico-hulkenberg', 2011)).toBe(false);
  });

  it('negotiates by clear rules', () => {
    expect(willTalk(96, 8)).toBe(false);
    expect(willTalk(96, 3)).toBe(true);
    expect(willTalk(80, 12)).toBe(true);
    expect(offerResponse('d', 80, 6, 5, 5, [], 1)).toBe('signed');
    expect(offerResponse('d', 80, 6, 3, 5, [], 1)).toBe('refused');
    expect(offerResponse('d', 80, 6, 4.25, 5, ['d'], 1)).toBe('refused');
    expect(offerResponse('d', 96, 9, 30, 5, [], 1)).toBe('not-interested');
  });

  it("signs a driver into a lapsed contract's seat, and settles the contracts step once all is signed", () => {
    let outfit = newOutfit(ctx('williams', 2012));
    outfit = { ...outfit, drivers: outfit.drivers.map((contract) => ({ ...contract, until: 2012 })), preseason: ['contracts', 'sponsor'] };
    const c = ctx('williams', 2013);
    const market = driverMarket(outfit, c);
    const pick = market.find((entry) => entry.status !== 'yours' && willTalk(entry.overall, 12))!;
    const signed = offerDriver(outfit, c, pick.driver, 2, false);
    expect(signed.result).toBe('signed');
    expect(signed.outfit.drivers.some((contract) => contract.driver === pick.driver && contract.until === 2014)).toBe(true);
    expect(contractsSettled(signed.outfit, 2013)).toBe(false);
  });
});

describe('engines', () => {
  it('knows the works teams', () => {
    expect(isWorks('ferrari', 'ferrari')).toBe(true);
    expect(isWorks('mclaren', 'honda')).toBe(true);
    expect(isWorks('williams', 'mercedes')).toBe(false);
    expect(isWorks('sauber', 'audi')).toBe(true);
  });

  it('sells customer engines only from makers that really sold them', () => {
    expect(customerMakers(2015)).toEqual(['ferrari', 'mercedes', 'renault']);
    expect(customerMakers(2010)).toContain('cosworth');
    expect(customerMakers(2014)).not.toContain('cosworth');
  });

  it('rates the 2014 Mercedes engine the best, and charges more for it', () => {
    expect(engineStrength('mercedes', 2014)[0]).toBeGreaterThan(engineStrength('ferrari', 2014)[0]);
    expect(engineStrength('mercedes', 2014)[0]).toBeGreaterThan(engineStrength('renault', 2014)[0]);
    expect(engineLease('mercedes', 2014)).toBeGreaterThan(engineLease('renault', 2014));
  });
});

describe('development', () => {
  it('has the parts of each era, and lets only works teams build power units', () => {
    expect(partsIn(2010)).toEqual(['aero', 'chassis', 'engine']);
    expect(partsIn(2014)).toEqual(['aero', 'chassis', 'engine', 'battery', 'recovery']);
    expect(canBuild('engine', 2012, true)).toBe(false); // the V8 freeze
    expect(canBuild('engine', 2014, true)).toBe(true);
    expect(canBuild('engine', 2014, false)).toBe(false);
    expect(canBuild('aero', 2014, false)).toBe(true);
  });

  it('charges more for each new version of a part, Golden Lap style', () => {
    expect(buildCost('aero', 1) - buildCost('aero', 0)).toBe(2);
    const part = { perf: 0, rel: 0, builds: 0, upgrades: 0 };
    expect(withBuild(part, 1.2, 5)).toEqual({ perf: 1.2, rel: -5, builds: 1, upgrades: 0 });
    expect(withUpgrade({ ...part, rel: -6 }, 0.25)).toEqual({ perf: 0.25, rel: -2, builds: 0, upgrades: 1 });
    expect(withUpgrade({ ...part, rel: 3 }, 0.25).rel).toBe(4);
  });

  it("starts a season behind the real car by half a season's work, more for a richer team", () => {
    const rich = typicalSeason('ferrari', 2010);
    const poor = typicalSeason('hrt', 2010);
    expect(rich.half.aero!).toBeGreaterThan(poor.half.aero! * 2);
    expect(freshParts('ferrari', 2010).aero!.perf).toBeCloseTo(-rich.half.aero!, 6);
    expect(rich.nextYear).toBeLessThan(typicalSeason('ferrari', 2013).nextYear);
  });

  it('carries less into a new rules era, and counts work on the new car for more', () => {
    const ahead = { aero: { perf: 6, rel: 0, builds: 5, upgrades: 0 }, chassis: { perf: 6, rel: 0, builds: 5, upgrades: 0 } };
    const quiet = nextSeasonParts(ahead, 'ferrari', 2015, typicalSeason('ferrari', 2015).nextYear, 1, true);
    const reset = nextSeasonParts(ahead, 'ferrari', 2016, typicalSeason('ferrari', 2016).nextYear, 1, true);
    const excessCarried = (parts: typeof quiet, season: number) => parts.aero!.perf + typicalSeason('ferrari', season).half.aero!;
    expect(excessCarried(quiet, 2016)).toBeGreaterThan(excessCarried(reset, 2017));
    expect(projectEffect(100, 25, true, 1)).toBeGreaterThan(projectEffect(100, 25, false, 1));
    expect(projectEffect(0, 25, true, 1)).toBeLessThan(0);
    expect(projectEffect(25, 25, false, 1)).toBeCloseTo(0, 6);
  });

  it('adds the parts to the real car', () => {
    const base = { aero: 80, chassis: 80, power: 80, reliability: 85, pitCrew: 70 };
    const parts = { aero: { perf: 2, rel: -4, builds: 1, upgrades: 0 }, chassis: { perf: 1, rel: 0, builds: 1, upgrades: 0 }, engine: { perf: 0, rel: 0, builds: 0, upgrades: 0 } };
    const car = playerCar(base, parts, 2010, [0, 0], 75);
    expect(car.aero).toBe(82);
    expect(car.chassis).toBe(81);
    expect(car.power).toBe(80);
    expect(car.reliability).toBeLessThan(85);
    expect(car.pitCrew).toBe(75);
    expect(playerCar(base, parts, 2010, [3, -2], 75).power).toBe(83);
  });
});

describe('power units', () => {
  it('lasts long enough for a season at the standard mode, within the allowance', () => {
    for (const season of [2010, 2014, 2018, 2026]) {
      const rules = rulesFor(season);
      const used = (1 + 0.6) * (season === 2010 ? 19 : season === 2014 ? 19 : season === 2018 ? 21 : 24);
      expect(unitLife(season, 'engine') * rules.engineAllowance).toBeGreaterThan(used);
    }
    expect(unitLife(2012, 'battery')).toBe(Infinity);
  });

  it('penalises units past the allowance by the rules of the time', () => {
    expect(penaltyForUnit('engine', 8, 2012)).toBe(0);
    expect(penaltyForUnit('engine', 9, 2012)).toBe(10);
    expect(penaltyForUnit('engine', 10, 2012)).toBe(10);
    expect(penaltyForUnit('engine', 5, 2015)).toBe(10);
    expect(penaltyForUnit('engine', 6, 2015)).toBe(5);
    expect(fitNew(freshUnits(2015), 'engine', 2015)).toMatchObject({ places: 0 });
  });

  it('replaces worn units, and ages them for the race engine', () => {
    const worn = { ...freshUnits(2019), engineWear: unitLife(2019, 'engine') + 0.1 };
    const result = replaceWorn(worn, 2019);
    expect(result.fitted).toEqual(['engine']);
    expect(result.unit.engines).toBe(2);
    expect(raceEngineAge(freshUnits(2019), 2019)).toBe(0);
    expect(raceEngineAge(worn, 2019)).toBeCloseTo(0.55, 6);
  });

  it('moves a penalised car back on the grid, the others closing up', () => {
    const cars = ['a', 'b', 'c', 'd', 'e'].map((driver) => ({ id: driver, driver }) as Entrant);
    expect(applyPenalties(cars, { b: 2 }).map((car) => car.driver)).toEqual(['a', 'c', 'd', 'b', 'e']);
    expect(applyPenalties(cars, { a: 10 }).map((car) => car.driver)).toEqual(['b', 'c', 'd', 'e', 'a']);
  });
});

describe('the budget cap', () => {
  const spend = (outfit: Outfit, amount: number): Outfit => ({
    ...outfit,
    ledger: [...outfit.ledger, { round: 1, kind: 'part', label: 'test', amount: -amount, capped: true }],
  });
  const outfit = newOutfit(ctx('ferrari', 2021));

  it('does nothing before 2021, and nothing within the cap', () => {
    expect(capVerdict(spend(outfit, 500), 2020)).toBeNull();
    expect(capVerdict(spend(outfit, 140), 2021)).toEqual({ over: 0, fine: 0, factor: 1 });
  });

  it('fines a small breach and slows development; a big one more so', () => {
    expect(capVerdict(spend(outfit, 150), 2021)).toEqual({ over: 5, fine: 10, factor: 0.9 });
    expect(capVerdict(spend(outfit, 160), 2021)).toEqual({ over: 15, fine: 45, factor: 0.75 });
  });
});

describe('running the team', () => {
  it('takes over a team with its real drivers, staff, and a sponsor to sign', () => {
    const outfit = newOutfit(ctx('ferrari', 2010));
    expect(outfit.drivers.map((contract) => contract.driver).sort()).toEqual(['felipe-massa', 'fernando-alonso']);
    expect(outfit.staff).toHaveLength(5);
    expect(outfit.preseason).toEqual(['sponsor']);
    expect(outfit.money).toBeGreaterThan(100);
    expect(outfit.challengeOffers.length).toBeGreaterThan(0);
  });

  it('spends on parts, refusing what it cannot afford', () => {
    const outfit = newOutfit(ctx('williams', 2014));
    const c = ctx('williams', 2014, 3);
    const built = buildPart(outfit, c, 'aero');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.outfit.money).toBe(Math.round((outfit.money - 8) * 10) / 10);
    expect(built.outfit.parts.aero!.perf).toBeGreaterThan(outfit.parts.aero!.perf);
    expect(built.outfit.parts.aero!.builds).toBe(1);
    expect(buildPart(outfit, c, 'engine').ok).toBe(false); // a Mercedes customer
    expect(buildPart({ ...outfit, money: 3 }, c, 'aero').ok).toBe(false);
    expect(upgradePart({ ...outfit, money: 3 }, c, 'engine').ok).toBe(true);
    expect(investNextYear(outfit, ctx('williams', 2026), 5).ok).toBe(false);
  });

  it('settles a Grand Prix: sponsor money, salaries, and wear on the power units', () => {
    const start = newOutfit(ctx('ferrari', 2010));
    const signed = chooseSponsor(start, start.sponsorOffers[1]!.id);
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;
    const race = [finish('fernando-alonso', 'ferrari', 1), finish('felipe-massa', 'ferrari', 2)];
    const after = settleRace(signed.outfit, ctx('ferrari', 2010, 1), race, [1, 1], { place: 1, rival: 'red-bull' });
    const kinds = new Set(after.ledger.slice(start.ledger.length).map((entry) => entry.kind));
    expect([...kinds].sort()).toEqual(['bonus', 'drivers', 'sponsor', 'staff']);
    expect(after.units[0]!.engineWear).toBeCloseTo(1.6, 6);
    expect(after.challengeOffers.length).toBe(3);
  });

  it('turns the season: prize money, lapsed contracts and the winter steps', () => {
    const outfit = newOutfit(ctx('williams', 2012));
    const next = turnSeason({ ...outfit, sponsor: outfit.sponsorOffers[0]!, preseason: [] }, ctx('williams', 2013), 8);
    expect(next.ledger.map((entry) => entry.kind)).toEqual(['backers', 'prize']);
    expect(next.ledger[1]!.amount).toBe(prizeMoney(8));
    expect(next.preseason).toEqual(['contracts', 'engine', 'sponsor']);
    expect(next.sponsor).toBeNull();
    expect(next.lastPlace).toBe(8);
    expect(next.market?.staffPool.length).toBe(25);
  });
});

describe('a career with a team business', () => {
  const start = (team: string): CareerState => chooseTeam(newCareer('business', new Date('2026-11-15T12:00:00Z')), team);

  it('sets up the business when the team is chosen, and applies changes through the career', () => {
    const career = start('williams');
    expect(career.outfit).not.toBeNull();
    const { career: signed, reason } = withOutfit(career, (outfit) => chooseSponsor(outfit, outfit.sponsorOffers[0]!.id));
    expect(reason).toBeNull();
    expect(signed.outfit!.sponsor).not.toBeNull();
    expect(withOutfit(career, () => ({ ok: false, reason: 'no' })).reason).toBe('no');
  });

  it("races the player's contracted drivers in the team's own car, and refills a seat taken from another team", () => {
    const career = start('williams');
    const outfit = career.outfit!;
    // Williams has signed Heidfeld, who really drove for Renault in 2011.
    const poached: Outfit = {
      ...outfit,
      drivers: [{ driver: 'nick-heidfeld', salary: 8, backing: 0, until: 2011 }, outfit.drivers[1]!],
    };
    const entrants = roundEntrants('business', 2011, 1, 'williams', {}, poached);
    const williams = entrants.filter((entrant) => entrant.team === 'williams');
    expect(williams.map((entrant) => entrant.driver)).toContain('nick-heidfeld');
    expect(williams.every((entrant) => entrant.player)).toBe(true);
    const renault = entrants.filter((entrant) => entrant.team === 'renault');
    expect(renault).toHaveLength(2);
    expect(renault.map((entrant) => entrant.driver)).not.toContain('nick-heidfeld');
    expect(new Set(entrants.map((entrant) => entrant.driver)).size).toBe(entrants.length);
  });

  it('plays a season on its own, paying its way and finishing near the real team', () => {
    let career = start('williams');
    while (career.seasonYear === 2010) career = autoplay(career);
    const place = career.history[0]!.teams.find((row) => row.id === 'williams')!.position;
    expect(Math.abs(place - expectedPlace('williams', 2010))).toBeLessThanOrEqual(2);
    expect(career.outfit!.preseason.length).toBeGreaterThan(0);
    expect(career.outfit!.money).toBeGreaterThan(-10);
    expect(finishManagement(career)).toBe(career); // not between races
  }, 60_000);

  it('upgrades a Stage 5 save by giving its team a business', () => {
    const old = { ...start('mclaren'), outfit: undefined } as Record<string, unknown>;
    delete old.outfit;
    const upgraded = MIGRATIONS[2]!(old) as CareerState;
    expect(upgraded.outfit?.drivers.length).toBe(2);
    expect((MIGRATIONS[2]!({ ...old, team: null }) as CareerState).outfit).toBeNull();
  });
});

describe('each part against the field', () => {
  it('ranks aero and chassis as the car does, and the power parts by the power each would give', async () => {
    const { carAgainstField, partLevels } = await import('../src/game/season/business');
    const career = chooseTeam(newCareer('levels', new Date('2026-11-16T10:00:00Z')), 'mclaren');
    const levels = partLevels({ ...career, seasonYear: 2014 });
    const field = carAgainstField({ ...career, seasonYear: 2014 });
    expect(Object.keys(levels).sort()).toEqual(['aero', 'battery', 'chassis', 'engine', 'recovery']);
    expect(levels.aero!.rank).toBe(field.find((row) => row.quality === 'aero')!.rank);
    expect(levels.chassis!.share).toBeCloseTo(field.find((row) => row.quality === 'chassis')!.share, 9);
    for (const level of Object.values(levels)) {
      expect(level!.share).toBeGreaterThanOrEqual(0);
      expect(level!.share).toBeLessThanOrEqual(1);
      expect(level!.of).toBe(11);
    }
    // A power part that is further along than the others shows a higher level.
    const ahead = { ...career, seasonYear: 2014, outfit: { ...career.outfit!, parts: { ...career.outfit!.parts, engine: { ...career.outfit!.parts.engine!, perf: (career.outfit!.parts.engine?.perf ?? 0) + 4 } } } };
    expect(partLevels(ahead).engine!.share).toBeGreaterThanOrEqual(partLevels(ahead).battery!.share);
    // 2010: no battery or energy recovery on the cars.
    expect(Object.keys(partLevels(career)).sort()).toEqual(['aero', 'chassis', 'engine']);
  });
});
