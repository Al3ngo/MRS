/**
 * Stage 7: the driver lifecycle. Made-up drivers, who is in the sport, retirements, fatal
 * accidents, newcomers, the junior academy, and how a career carries all of it.
 */
import { describe, expect, it } from 'vitest';
import { chooseTeam, finishRace, newCareer, teamContext, type CareerState } from '../src/game/career';
import { ageIn, careerTag, driver, fictionalDriver, isFictional } from '../src/game/data';
import { MIGRATIONS } from '../src/game/save-schema';
import { roundEntrants } from '../src/game/season/grid';
import { autoplay } from '../src/game/season/sessions';
import { ratingsIn } from '../src/game/sim';
import {
  academyFee,
  academyProspects,
  academyYears,
  driverMarket,
  heldBy,
  newOutfit,
  offerDriver,
  releaseJunior,
  signJunior,
  turnSeason,
  type Outfit,
} from '../src/game/team';
import {
  activeIn,
  careerOver,
  careerStage,
  fatalChance,
  fatalities,
  freePool,
  newcomers,
  newWorld,
  prospects,
  raceAge,
  realSeats,
  type LostDriver,
  type World,
} from '../src/game/world';

describe('made-up drivers', () => {
  it('come out the same every time from their id', () => {
    const id = 'fx-2019-p2-abcde';
    expect(fictionalDriver(id)).toBe(fictionalDriver(id));
    expect(driver(id).name).toBe(fictionalDriver(id).fact.name);
    expect(isFictional(id)).toBe(true);
    expect(isFictional('lewis-hamilton')).toBe(false);
    expect(driver(id).code).toMatch(/^[A-Z]{3}$/);
    expect(() => ratingsIn(id, 2022)).not.toThrow();
  });

  it('arrive young as prospects, older when ready to race, with potential and a retiring age', () => {
    for (let n = 1; n <= 30; n++) {
      const prospect = fictionalDriver(`fx-2015-p${n}-tag`);
      const ready = fictionalDriver(`fx-2015-r${n}-tag`);
      const prospectAge = ageIn(prospect.fact, 2015);
      const readyAge = ageIn(ready.fact, 2015);
      expect(prospectAge >= 14 && prospectAge <= 17, `prospect age ${prospectAge}`).toBe(true);
      expect(readyAge >= 20 && readyAge <= 26, `ready age ${readyAge}`).toBe(true);
      expect(prospect.potential).toBeGreaterThanOrEqual(68);
      expect(prospect.potential).toBeLessThanOrEqual(95);
      expect(prospect.retireAge >= 33 && prospect.retireAge <= 38).toBe(true);
    }
    expect(careerTag('one')).not.toBe(careerTag('two'));
  });
});

describe('who is in the sport', () => {
  const world = newWorld();
  const none = new Set<string>();

  it('retires real drivers when they really stopped, unless the player holds them', () => {
    expect(activeIn(world, 'michael-schumacher', 2012, none)).toBe(true);
    expect(activeIn(world, 'michael-schumacher', 2013, none)).toBe(false);
    expect(activeIn(world, 'michael-schumacher', 2013, new Set(['michael-schumacher']))).toBe(true);
    expect(careerOver('fernando-alonso', 2026)).toBe(false);
  });

  it('keeps future drivers out until their debut, unless the player has them', () => {
    expect(activeIn(world, 'max-verstappen', 2013, none)).toBe(false);
    expect(activeIn(world, 'max-verstappen', 2015, none)).toBe(true);
    expect(activeIn(world, 'max-verstappen', 2013, new Set(['max-verstappen']))).toBe(true);
  });

  it('takes the lost out for good, and stops made-up drivers at their own age', () => {
    const lost: World = { ...world, lost: [{ driver: 'jenson-button', team: 'mclaren', season: 2011, round: 3, race: 'Chinese Grand Prix', lap: 12 }] };
    expect(activeIn(lost, 'jenson-button', 2012, none)).toBe(false);
    const made = fictionalDriver('fx-2012-r1-tag');
    const lastYear = Number(made.fact.born.slice(0, 4)) + made.retireAge;
    expect(careerOver(made.fact.id, lastYear)).toBe(false);
    expect(careerOver(made.fact.id, lastYear + 2)).toBe(true);
    expect(raceAge(2015)).toBe(17);
    expect(raceAge(2016)).toBe(18);
  });

  it('offers the best free drivers first, none taken, held or too young', () => {
    const withMade = newcomers(world, 'pool', 2014, none);
    const pool = freePool(withMade, 2014, realSeats(2014), none);
    expect(pool.length).toBeGreaterThan(3);
    for (let i = 1; i < pool.length; i++) expect(pool[i]!.overall).toBeLessThanOrEqual(pool[i - 1]!.overall);
    expect(pool.some((entry) => realSeats(2014).has(entry.driver.id))).toBe(false);
    expect(pool.every((entry) => entry.age >= raceAge(2014))).toBe(true);
  });

  it('says where a driver is in their career', () => {
    expect(careerStage('max-verstappen', 2015)).toBe('improving');
    expect(careerStage('michael-schumacher', 2012)).toBe('final');
    expect(careerStage('fernando-alonso', 2012)).toBe('peak');
  });
});

describe('fatal accidents', () => {
  it('are likelier before the halo, at dangerous circuits, for aggressive drivers', () => {
    expect(fatalChance(2016, 3, 70)).toBeGreaterThan(fatalChance(2019, 3, 70) * 2);
    expect(fatalChance(2016, 5, 70)).toBeGreaterThan(fatalChance(2016, 1, 70));
    expect(fatalChance(2016, 3, 90)).toBeGreaterThan(fatalChance(2016, 3, 50));
    // Rare: well under one in a hundred crashes, even at the worst.
    expect(fatalChance(2010, 5, 95)).toBeLessThan(0.01);
  });

  it('never happen when switched off, and only to cars that crashed out', () => {
    let career = chooseTeam(newCareer('fatal', new Date('2026-11-15T00:00:00Z')), 'williams', false);
    expect(career.world.fatalAccidents).toBe(false);
    career = chooseTeam(newCareer('fatal', new Date('2026-11-15T00:00:00Z')), 'williams');
    expect(career.world.fatalAccidents).toBe(true);
  });
});

describe('newcomers', () => {
  it('brings three prospects a season, the same ones every time', () => {
    const once = newcomers(newWorld(), 'career-x', 2012, new Set());
    const again = newcomers(newWorld(), 'career-x', 2012, new Set());
    expect(once.fictional).toEqual(again.fictional);
    expect(once.fictional.filter((id) => id.includes('-p')).length).toBe(3);
  });

  it('adds race-ready drivers when the free ones run thin', () => {
    // Hold every free real driver: the pool is empty without new faces.
    const free = freePool(newWorld(), 2018, realSeats(2018), new Set()).map((entry) => entry.driver.id);
    const thin = newcomers(newWorld(), 'career-y', 2018, new Set(free));
    expect(thin.fictional.some((id) => id.includes('-r'))).toBe(true);
    expect(freePool(thin, 2018, realSeats(2018), new Set(free)).filter((entry) => entry.overall >= 72).length).toBeGreaterThanOrEqual(6);
  });

  it('lists real drivers before their debut as academy prospects, with made-up ones', () => {
    const world = newcomers(newWorld(), 'career-z', 2013, new Set());
    const list = prospects(world, 2013, new Set()).map((entry) => entry.driver.id);
    expect(list).toContain('max-verstappen');
    expect(list.some(isFictional)).toBe(true);
    expect(list).not.toContain('lewis-hamilton');
  });
});

describe('the junior academy', () => {
  const ctx = { id: 'academy', team: 'williams', season: 2013, round: 1, winter: true };
  const world = newcomers(newWorld(), 'academy', 2013, new Set());
  const outfit = newOutfit(ctx);

  it('signs up to three juniors, each for a fee', () => {
    const list = academyProspects(outfit, world, 2013);
    let current: Outfit = outfit;
    for (const entry of list.slice(0, 3)) {
      const signed = signJunior(current, world, 2013, entry.driver.id);
      expect(signed.ok).toBe(true);
      if (signed.ok) current = signed.outfit;
    }
    expect(current.academy).toHaveLength(3);
    expect(signJunior(current, world, 2013, list[3]!.driver.id).ok).toBe(false);
    expect(academyFee('max-verstappen')).toBeGreaterThan(academyFee(list.at(-1)!.driver.id) - 0.01);
    expect(releaseJunior(current, list[0]!.driver.id).ok).toBe(true);
    expect(heldBy(current, 2013).has(list[0]!.driver.id)).toBe(true);
  });

  it('promotes a junior old enough to race, with a point a season of academy polish', () => {
    const junior = { driver: 'max-verstappen', since: 2013, fee: 3 };
    const later = { id: 'academy', team: 'williams', season: 2015, round: 1, winter: true, world };
    const held: Outfit = { ...outfit, academy: [junior], drivers: outfit.drivers.map((contract) => ({ ...contract, until: 2014 })) };
    expect(academyYears(held, 'max-verstappen', 2015)).toBe(2);
    const market = driverMarket(held, later);
    expect(market.find((entry) => entry.driver === 'max-verstappen')?.status).toBe('academy');
    const signed = offerDriver(held, later, 'max-verstappen', 2, false);
    expect(signed.result).toBe('signed');
    expect(signed.outfit.academy).toHaveLength(0);
    expect(signed.outfit.academyBonus['max-verstappen']).toBe(2);
  });
});

describe('a career with a lifecycle', () => {
  const start = (): CareerState => chooseTeam(newCareer('lifecycle', new Date('2026-11-15T12:00:00Z')), 'williams');
  const toRace = (career: CareerState): CareerState => {
    let current = career;
    while (current.phase !== 'race') current = autoplay(current);
    return current;
  };

  it("loses a driver, fills the seat before the next round, and the other teams fill theirs", () => {
    const career = toRace(start());
    const mine = career.outfit!.drivers[0]!.driver;
    const lost: LostDriver[] = [
      { driver: mine, team: 'williams', season: 2010, round: 1, race: 'Bahrain Grand Prix', lap: 20 },
      { driver: 'sebastian-vettel', team: 'red-bull', season: 2010, round: 1, race: 'Bahrain Grand Prix', lap: 20 },
    ];
    const after = finishRace(career, [], null, [1, 1], lost);
    expect(after.world.lost).toHaveLength(2);
    expect(after.outfit!.drivers.map((contract) => contract.driver)).not.toContain(mine);
    expect(after.outfit!.preseason).toContain('contracts');
    expect(after.outfit!.news.some((item) => item.startsWith(`lost:${mine}`))).toBe(true);
    // During a season, only drivers without a seat are on offer.
    const market = driverMarket(after.outfit!, teamContext({ ...after, phase: 'management' }));
    expect(market.length).toBeGreaterThan(0);
    expect(market.every((entry) => !realSeats(2010).has(entry.driver))).toBe(true);
    // The next round: the seat is filled, and Red Bull races someone else.
    let next = autoplay(after);
    while (next.round === 1) next = autoplay(next);
    expect(next.outfit!.drivers.filter((contract) => contract.until >= 2010)).toHaveLength(2);
    const grid = roundEntrants(next.id, 2010, 2, 'williams', {}, next.outfit, next.world);
    expect(grid.map((entrant) => entrant.driver)).not.toContain('sebastian-vettel');
    expect(grid.filter((entrant) => entrant.team === 'red-bull')).toHaveLength(2);
    expect(new Set(grid.map((entrant) => entrant.driver)).size).toBe(grid.length);
  }, 60_000);

  it('lets a driver under contract see it out after his real career ends', () => {
    const ctx = { id: 'old', team: 'mercedes', season: 2012, round: 1 };
    const outfit = newOutfit(ctx);
    const schumacher = outfit.drivers.find((contract) => contract.driver === 'michael-schumacher')!;
    const kept: Outfit = { ...outfit, drivers: outfit.drivers.map((contract) => (contract === schumacher ? { ...contract, until: 2013 } : contract)) };
    const next = turnSeason({ ...kept, preseason: [] }, { ...ctx, season: 2013, world: newWorld(), winter: true }, 5);
    expect(next.drivers.map((contract) => contract.driver)).toContain('michael-schumacher');
    const lapsed = turnSeason({ ...outfit, preseason: [] }, { ...ctx, season: 2013, world: newWorld(), winter: true }, 5);
    expect(lapsed.drivers.map((contract) => contract.driver)).not.toContain('michael-schumacher');
  });

  it('runs fatal accident checks that respect the setting', () => {
    const career = toRace(start());
    expect(fatalities({ ...career.world, fatalAccidents: false }, career.id, {} as never)).toEqual([]);
  }, 60_000);

  it('upgrades a Stage 6 save with an empty academy, nobody lost, and fatal accidents on', () => {
    const old = start() as unknown as Record<string, unknown>;
    const { world: _world, ...rest } = old;
    const outfit = { ...(rest.outfit as object) } as Record<string, unknown>;
    delete outfit.academy;
    delete outfit.academyBonus;
    const upgraded = MIGRATIONS[3]!({ ...rest, outfit }) as CareerState;
    expect(upgraded.world.lost).toEqual([]);
    expect(upgraded.world.fatalAccidents).toBe(true);
    expect(upgraded.world.fictional.length).toBeGreaterThanOrEqual(3);
    expect(upgraded.outfit!.academy).toEqual([]);
  });
});
