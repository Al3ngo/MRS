/**
 * A whole career, 2010 to 2026, every session played by the pit wall: 352 Grands Prix and every
 * sprint. The career must stay sound at every step, the points must add up, and the save must stay
 * a sensible size. HRT, so that the team carries on after its real exit at the end of 2012.
 */
import { describe, expect, it } from 'vitest';
import { chooseTeam, findProblems, newCareer, type CareerState } from '../src/game/career';
import { calendar, SEASONS } from '../src/game/data';
import { autoplay } from '../src/game/season/sessions';

describe('a whole career', () => {
  it('runs from 2010 to the end of 2026, sound at every step', () => {
    let career: CareerState = chooseTeam(newCareer('full-career', new Date('2026-11-14T12:00:00Z')), 'hrt');
    let largest = 0;
    let steps = 0;
    const seasonTotals = new Map<number, { drivers: number; teams: number; sprints: number }>();
    while (!(career.finished && career.phase === 'management')) {
      const before = career;
      career = autoplay(career);
      steps += 1;
      expect(career).not.toBe(before);
      expect(findProblems(career), `${career.seasonYear} round ${career.round} ${career.phase}`).toEqual([]);
      largest = Math.max(largest, JSON.stringify(career).length);
      if (career.seasonYear !== before.seasonYear) {
        const record = career.history.at(-1)!;
        const drivers = record.drivers.reduce((sum, row) => sum + row.points, 0);
        const teams = record.teams.reduce((sum, row) => sum + row.points, 0);
        seasonTotals.set(record.season, { drivers, teams, sprints: before.results.filter((result) => result.sprint).length });
      }
      if (steps > 3000) throw new Error('the career never finished');
    }

    expect(career.seasonYear).toBe(2026);
    expect(career.history.map((record) => record.season)).toEqual(SEASONS.slice(0, -1));
    expect(career.results).toHaveLength(calendar(2026).length);
    expect(career.history.every((record) => record.team === 'hrt')).toBe(true);
    // Every season the team is in the constructors' table, long after its real exit too.
    expect(career.history.every((record) => record.teams.some((row) => row.id === 'hrt'))).toBe(true);
    for (const [season, totals] of seasonTotals) {
      // Drivers' and constructors' points are the same points, counted two ways.
      expect(totals.drivers, `${season}`).toBeCloseTo(totals.teams, 6);
      // A full season pays at least 101 points a race, double at the 2014 finale.
      expect(totals.drivers, `${season}`).toBeGreaterThanOrEqual(calendar(season).length * 101 * 0.9);
      expect(totals.sprints, `${season} sprints`).toBe(calendar(season).filter((round) => round.sprintLaps !== null).length);
    }
    expect(largest).toBeLessThan(400_000);
  }, 180_000);
});
