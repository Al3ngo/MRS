import { describe, expect, it } from 'vitest';
import {
  FIRST_SEASON,
  LAST_SEASON,
  SEASON_COUNT,
  completeSession,
  findProblems,
  newCareer,
  racesRun,
  roundsIn,
  summarise,
  type CareerState,
} from '../src/game/career';
import { MIGRATIONS, SCHEMA_VERSION, SaveError, migrate, upgradeCareer } from '../src/game/save-schema';

const start = () => newCareer('career-1', new Date('2026-11-12T18:00:00Z'));

function play(state: CareerState, sessions: number): CareerState {
  let current = state;
  for (let i = 0; i < sessions; i++) current = completeSession(current);
  return current;
}

describe('career', () => {
  it('starts at the first practice of 2010', () => {
    expect(start()).toEqual({
      id: 'career-1',
      createdAt: '2026-11-12T18:00:00.000Z',
      seasonYear: 2010,
      round: 1,
      phase: 'practice',
      sessionsCompleted: 0,
      finished: false,
    });
    expect(findProblems(start())).toEqual([]);
  });

  it('runs a round as practice, qualifying, race, then management', () => {
    const phases = [1, 2, 3, 4].map((n) => play(start(), n)).map((s) => `${s.round}:${s.phase}`);
    expect(phases).toEqual(['1:qualifying', '1:race', '1:management', '2:practice']);
  });

  it('never changes the career it is given', () => {
    const before = start();
    const frozen = Object.freeze({ ...before });
    completeSession(frozen);
    expect(frozen).toEqual(before);
  });

  it('counts a race as run once it is behind you', () => {
    expect(racesRun(play(start(), 2))).toBe(0); // race still to come
    expect(racesRun(play(start(), 3))).toBe(1); // in the management phase after it
    expect(racesRun(play(start(), 4))).toBe(1); // round 2 practice
  });

  it('rolls into the next season after the last round', () => {
    const lastManagement = play(start(), roundsIn(2010) * 4 - 1);
    expect(lastManagement).toMatchObject({ seasonYear: 2010, round: roundsIn(2010), phase: 'management' });
    expect(completeSession(lastManagement)).toMatchObject({ seasonYear: 2011, round: 1, phase: 'practice' });
  });

  it('ends after the last race of 2026 and goes no further', () => {
    let races = 0;
    for (let year = FIRST_SEASON; year <= LAST_SEASON; year++) races += roundsIn(year);
    expect(SEASON_COUNT).toBe(17);

    const beforeFinalRace = play(start(), races * 4 - 2);
    expect(beforeFinalRace).toMatchObject({ seasonYear: 2026, round: roundsIn(2026), phase: 'race', finished: false });

    const end = completeSession(beforeFinalRace);
    expect(end).toMatchObject({ seasonYear: 2026, round: roundsIn(2026), finished: true });
    expect(end.sessionsCompleted).toBe(races * 4 - 1);
    expect(findProblems(end)).toEqual([]);

    expect(completeSession(end)).toBe(end);
    expect(summarise(end)).toMatchObject({ finished: true, racesRun: roundsIn(2026), rounds: roundsIn(2026) });
  });

  it('stays sound at every step of a whole career', () => {
    let state = start();
    let guard = 0;
    while (!state.finished) {
      state = completeSession(state);
      expect(findProblems(state)).toEqual([]);
      if (++guard > 5000) throw new Error('the career never finished');
    }
  });

  it('names what is wrong with a damaged career', () => {
    expect(findProblems(null)).toHaveLength(1);
    expect(findProblems('2010')).toHaveLength(1);
    expect(findProblems([])).toHaveLength(1);
    expect(findProblems({})).toHaveLength(7);
    expect(findProblems({ ...start(), seasonYear: 2027 })).toEqual(['The season must be between 2010 and 2026.']);
    expect(findProblems({ ...start(), seasonYear: 2010.5 })).toHaveLength(1);
    expect(findProblems({ ...start(), round: 20 })).toEqual(['Season 2010 has 19 rounds; the save is on round 20.']);
    expect(findProblems({ ...start(), round: 0 })).toHaveLength(1);
    expect(findProblems({ ...start(), phase: 'warm-up' })).toHaveLength(1);
    expect(findProblems({ ...start(), sessionsCompleted: -1 })).toHaveLength(1);
    expect(findProblems({ ...start(), createdAt: 'yesterday' })).toHaveLength(1);
    expect(findProblems({ ...start(), finished: 'no' })).toHaveLength(1);
    expect(findProblems({ ...start(), id: '' })).toHaveLength(1);
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
