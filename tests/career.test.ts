import { describe, expect, it } from 'vitest';
import {
  STARTING_TEAMS,
  chooseTeam,
  finishManagement,
  findProblems,
  newCareer,
  racesRun,
  roundsIn,
  summarise,
  type CareerState,
} from '../src/game/career';
import { calendar } from '../src/game/data';
import { MIGRATIONS, SCHEMA_VERSION, SaveError, migrate, upgradeCareer } from '../src/game/save-schema';
import { autoplay, gridFor, playerCars, practiceRun, practiceSetups, startPractice } from '../src/game/season/sessions';
import { driverStandings, teamStandings, type RoundResult } from '../src/game/season/standings';
import { gridSource, sessionName, weekendSessions } from '../src/game/season/weekend';

const start = (): CareerState => newCareer('career-1', new Date('2026-11-12T18:00:00Z'));
const withTeam = (team = 'ferrari'): CareerState => chooseTeam(start(), team);

/** Plays sessions until `done` says stop. */
function playUntil(state: CareerState, done: (career: CareerState) => boolean, limit = 400): CareerState {
  let current = state;
  for (let i = 0; i < limit && !done(current); i++) current = autoplay(current);
  if (!done(current)) throw new Error('never got there');
  return current;
}

/** A career dropped straight into a season, as if the seasons before had been played. */
const inSeason = (season: number, team = 'ferrari'): CareerState => ({ ...withTeam(team), seasonYear: season });

describe('a new career', () => {
  it('starts in 2010 at the first practice, with no team until one is chosen', () => {
    const career = start();
    expect(career).toMatchObject({ team: null, seasonYear: 2010, round: 1, phase: 'practice', results: [], history: [] });
    expect(findProblems(career)).toEqual([]);
    expect(summarise(career)).toMatchObject({ team: null, teamName: null, racesRun: 0, rounds: 19 });
  });

  it('can be started with any team on the 2010 grid, and only once', () => {
    expect(STARTING_TEAMS).toHaveLength(12);
    expect(STARTING_TEAMS).toEqual(expect.arrayContaining(['hrt', 'virgin', 'lotus-racing', 'red-bull']));
    expect(STARTING_TEAMS).not.toContain('haas');
    expect(() => chooseTeam(start(), 'haas')).toThrow();
    const career = withTeam('williams');
    expect(career.team).toBe('williams');
    expect(chooseTeam(career, 'ferrari').team).toBe('williams');
    expect(summarise(career)).toMatchObject({ team: 'williams', teamName: 'Williams' });
  });
});

describe('a race weekend', () => {
  it('runs practice, qualifying, the race and the management phase, then the next round', () => {
    let career = withTeam();
    const seen: string[] = [];
    while (career.round === 1) {
      seen.push(career.phase);
      career = autoplay(career);
    }
    expect(seen).toEqual(['practice', 'qualifying', 'race', 'management']);
    expect(career).toMatchObject({ round: 2, phase: 'practice', sessionsCompleted: 4 });
    expect(career.results).toHaveLength(1);
    expect(racesRun(career)).toBe(1);
    expect(findProblems(career)).toEqual([]);
  });

  it('keeps the player\'s two cars, with the setups found in practice', () => {
    const career = withTeam('mclaren');
    const cars = playerCars(career);
    expect(cars.map((car) => car.driver)).toEqual(expect.arrayContaining(['lewis-hamilton', 'jenson-button']));
    let practice = startPractice(career);
    for (let run = 0; run < 6; run++) practice = practiceRun(career, practice, cars[0]!.id);
    expect(practice.runs[cars[0]!.id]).toBe(4);
    expect(practice.hints[cars[0]!.id]).not.toBeNull();
    const setups = practiceSetups(career, practice);
    expect(Object.keys(setups).sort()).toEqual(cars.map((car) => car.id).sort());
    for (const value of Object.values(setups)) expect(value).toBeGreaterThanOrEqual(0);
  });

  it('follows each year\'s sprint format', () => {
    const sprintRound = (season: number) => calendar(season).find((round) => round.sprintLaps !== null)!.round;
    expect(weekendSessions(2019, 1)).toEqual(['practice', 'qualifying', 'race', 'management']);
    expect(weekendSessions(2021, sprintRound(2021))).toEqual(['practice', 'qualifying', 'sprint', 'race', 'management']);
    expect(weekendSessions(2023, sprintRound(2023))).toEqual(['practice', 'qualifying', 'sprint-qualifying', 'sprint', 'race', 'management']);
    expect(weekendSessions(2024, sprintRound(2024))).toEqual(['practice', 'sprint-qualifying', 'sprint', 'qualifying', 'race', 'management']);
    expect(gridSource(2021, sprintRound(2021), 'race')).toBe('sprint');
    expect(gridSource(2023, sprintRound(2023), 'race')).toBe('qualifying');
    expect(gridSource(2024, sprintRound(2024), 'sprint')).toBe('sprint-qualifying');
    expect(sessionName(2023, 'sprint-qualifying')).toBe('Sprint shootout');
    expect(sessionName(2025, 'sprint-qualifying')).toBe('Sprint qualifying');
  });

  it('puts the 2021 sprint\'s finishing order on the Grand Prix grid, and pays sprint points', () => {
    const round = calendar(2021).find((entry) => entry.sprintLaps !== null)!.round;
    let career = { ...inSeason(2021), round };
    career = playUntil(career, (current) => current.phase === 'race');
    const sprint = career.weekend.sprint!;
    expect(sprint.slice(0, 3).map((finish) => finish.points)).toEqual([3, 2, 1]);
    expect(gridFor(career, 'race').slice(0, 5).map((entrant) => entrant.driver)).toEqual(sprint.slice(0, 5).map((finish) => finish.driver));
    career = autoplay(career);
    const result = career.results.at(-1)!;
    expect(result.sprint).toEqual(sprint);
    expect(result.pole).toBe(sprint[0]!.driver);
  });

  it('scores the 2014 finale double', () => {
    const last = roundsIn(2014);
    const career = playUntil({ ...inSeason(2014), round: last }, (current) => current.phase === 'management');
    expect(career.results.at(-1)!.race[0]!.points).toBe(50);
  });
});

describe('the championships', () => {
  const finish = (driver: string, team: string, position: number, points: number) => ({
    driver,
    team,
    position,
    points,
    classified: true,
    status: 'Finished',
    grid: position,
    fastestLap: false,
  });

  it('add up race and sprint points for drivers and teams', () => {
    const results: RoundResult[] = [
      { round: 1, race: [finish('a', 'x', 1, 25), finish('b', 'y', 2, 18), finish('c', 'x', 3, 15)], sprint: null, pole: 'a' },
      { round: 2, race: [finish('b', 'y', 1, 25), finish('a', 'x', 2, 18), finish('c', 'x', 3, 15)], sprint: [finish('c', 'x', 1, 8)], pole: 'b' },
    ];
    const drivers = driverStandings(results);
    expect(drivers.map((row) => [row.id, row.points, row.wins, row.podiums])).toEqual([
      ['a', 43, 1, 2],
      ['b', 43, 1, 2],
      ['c', 38, 0, 2],
    ]);
    expect(teamStandings(results).map((row) => [row.id, row.points])).toEqual([
      ['x', 81],
      ['y', 43],
    ]);
  });

  it('split a tie on points by wins, then second places, counting Grands Prix only', () => {
    const results: RoundResult[] = [
      { round: 1, race: [finish('a', 'x', 2, 18), finish('b', 'y', 3, 15)], sprint: [finish('b', 'y', 1, 3)], pole: null },
      { round: 2, race: [finish('b', 'y', 2, 18), finish('a', 'x', 3, 15), finish('c', 'z', 1, 3)], sprint: null, pole: null },
    ];
    const order = driverStandings(results).map((row) => row.id);
    // a and b both have 33; neither won a Grand Prix (b's sprint win does not count); each has one second place,
    // and one third place: the id settles it, so the order is stable.
    expect(order.slice(0, 2).sort()).toEqual(['a', 'b']);
    const won: RoundResult[] = [
      { round: 1, race: [finish('a', 'x', 1, 25), finish('b', 'y', 2, 18)], sprint: null, pole: null },
      { round: 2, race: [finish('b', 'y', 1, 25), finish('a', 'x', 3, 15), finish('d', 'w', 2, 18)], sprint: [finish('a', 'x', 1, 3)], pole: null },
    ];
    // a: 25 + 15 + 3 = 43, b: 18 + 25 = 43. Both one win; b has a second place, a has none.
    expect(driverStandings(won).map((row) => row.id).slice(0, 2)).toEqual(['b', 'a']);
  });
});

describe('a season and a career', () => {
  it('files a finished season in the history and starts the next one', () => {
    const last = roundsIn(2010);
    let career = playUntil({ ...withTeam('hrt'), round: last }, (current) => current.phase === 'management');
    expect(career.results).toHaveLength(1);
    career = finishManagement(career);
    expect(career).toMatchObject({ seasonYear: 2011, round: 1, phase: 'practice', results: [] });
    expect(career.history).toHaveLength(1);
    expect(career.history[0]).toMatchObject({ season: 2010, team: 'hrt', teamName: 'HRT' });
    expect(career.history[0]!.drivers.length).toBeGreaterThan(20);
    expect(findProblems(career)).toEqual([]);
  });

  it('keeps the player\'s team racing after its real exit', () => {
    const career = inSeason(2015, 'hrt');
    const cars = playerCars(career);
    expect(cars).toHaveLength(2);
    expect(cars.every((car) => car.team === 'hrt' && car.player)).toBe(true);
    const field = gridFor(playUntil(career, (current) => current.phase === 'race'), 'race');
    expect(new Set(field.map((entrant) => entrant.driver)).size).toBe(field.length);
  });

  it('ends after the last race of 2026, and goes no further', () => {
    const last = roundsIn(2026);
    const career = playUntil({ ...inSeason(2026, 'mclaren'), round: last }, (current) => current.phase === 'management');
    expect(career.finished).toBe(true);
    expect(finishManagement(career)).toBe(career);
    expect(autoplay(career)).toBe(career);
    expect(summarise(career)).toMatchObject({ finished: true, seasonYear: 2026, racesRun: 1 });
    expect(findProblems(career)).toEqual([]);
  });
});

describe('damaged careers', () => {
  it('names what is wrong', () => {
    expect(findProblems(null)).toHaveLength(1);
    expect(findProblems('2010')).toHaveLength(1);
    expect(findProblems([])).toHaveLength(1);
    expect(findProblems({}).length).toBeGreaterThanOrEqual(8);
    expect(findProblems({ ...start(), seasonYear: 2027 })).toEqual(['The season must be between 2010 and 2026.']);
    expect(findProblems({ ...start(), seasonYear: 2010.5 })).toHaveLength(1);
    expect(findProblems({ ...start(), round: 20 })).toEqual(['Season 2010 has 19 rounds; the save is on round 20.']);
    expect(findProblems({ ...start(), round: 0 })).toHaveLength(1);
    expect(findProblems({ ...start(), phase: 'warm-up' })).toHaveLength(1);
    expect(findProblems({ ...start(), phase: 'sprint' })).toEqual(['The next session is not part of this round.']);
    expect(findProblems({ ...start(), team: 'brawn' })).toHaveLength(1);
    expect(findProblems({ ...start(), sessionsCompleted: -1 })).toHaveLength(1);
    expect(findProblems({ ...start(), createdAt: 'yesterday' })).toHaveLength(1);
    expect(findProblems({ ...start(), finished: 'no' })).toHaveLength(1);
    expect(findProblems({ ...start(), id: '' })).toHaveLength(1);
    expect(findProblems({ ...start(), weekend: null })).toHaveLength(1);
    expect(findProblems({ ...start(), results: [{ round: 3, race: [], sprint: null }] })).toHaveLength(1);
    expect(findProblems({ ...start(), round: 5, results: [{ round: 2, race: [], sprint: null }, { round: 2, race: [], sprint: null }] })).toHaveLength(1);
  });

  it('upgrades a career from the Stage 1 to 4 stand-in', () => {
    const old = { id: 'old', createdAt: '2026-11-01T10:00:00.000Z', seasonYear: 2012, round: 7, phase: 'race', sessionsCompleted: 250, finished: false };
    const upgraded = upgradeCareer(old, 1);
    expect(upgraded).toMatchObject({ id: 'old', team: null, seasonYear: 2012, round: 1, phase: 'practice', sessionsCompleted: 250, results: [] });
    expect(findProblems(upgraded)).toEqual([]);
  });
});

describe('save versions', () => {
  const table = {
    1: (old: unknown) => ({ ...(old as object), addedInV2: true }),
    2: (old: unknown) => ({ ...(old as object), addedInV3: 'yes' }),
  };

  it('upgrades one version at a time', () => {
    expect(migrate({ a: 1 }, 1, 3, table)).toEqual({ a: 1, addedInV2: true, addedInV3: 'yes' });
    expect(migrate({ a: 1 }, 2, 3, table)).toEqual({ a: 1, addedInV3: 'yes' });
    expect(migrate({ a: 1 }, 3, 3, table)).toEqual({ a: 1 });
  });

  it('refuses saves from the future, from too long ago, or with no version', () => {
    const code = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        return error instanceof SaveError ? error.code : error;
      }
      return 'no error';
    };
    expect(code(() => migrate({}, 4, 3, table))).toBe('too-new');
    expect(code(() => migrate({}, 1, 4, table))).toBe('too-old');
    expect(code(() => migrate({}, 0, 3, table))).toBe('not-a-save');
    expect(code(() => migrate({}, 1.5, 3, table))).toBe('not-a-save');
    expect(code(() => migrate({}, Number.NaN, 3, table))).toBe('not-a-save');
  });

  it('has a migration for every version before the current one', () => {
    for (let version = 1; version < SCHEMA_VERSION; version++) {
      expect(MIGRATIONS[version], `missing MIGRATIONS[${version}]`).toBeTypeOf('function');
    }
  });

  it('checks a career after upgrading it', () => {
    expect(upgradeCareer(start(), SCHEMA_VERSION)).toEqual(start());
    expect(upgradeCareer(withTeam(), SCHEMA_VERSION)).toEqual(withTeam());
    try {
      upgradeCareer({ ...start(), round: 99 }, SCHEMA_VERSION);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SaveError);
      expect((error as SaveError).code).toBe('invalid');
      expect((error as SaveError).problems).toEqual(['Season 2010 has 19 rounds; the save is on round 99.']);
    }
  });
});
