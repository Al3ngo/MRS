/**
 * The shape of a race weekend, season by season.
 *
 * An ordinary weekend is practice, qualifying, race, then the management phase before the next
 * round. Sprint weekends (from 2021) follow the real format of their year:
 *
 *   2021-2022  practice, qualifying (sets the sprint grid), sprint (sets the race grid), race
 *   2023       practice, qualifying (sets the race grid), sprint shootout, sprint, race
 *   2024 on    practice, sprint qualifying, sprint, qualifying, race
 */
import { calendar } from '../data';

export const SESSION_KINDS = ['practice', 'sprint-qualifying', 'qualifying', 'sprint', 'race', 'management'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const isSprintRound = (season: number, round: number): boolean =>
  calendar(season)[round - 1]?.sprintLaps != null;

/** The sessions of a round, in the order they are run, ending with the management phase. */
export function weekendSessions(season: number, round: number): readonly SessionKind[] {
  if (!isSprintRound(season, round)) return ['practice', 'qualifying', 'race', 'management'];
  if (season <= 2022) return ['practice', 'qualifying', 'sprint', 'race', 'management'];
  if (season === 2023) return ['practice', 'qualifying', 'sprint-qualifying', 'sprint', 'race', 'management'];
  return ['practice', 'sprint-qualifying', 'sprint', 'qualifying', 'race', 'management'];
}

/** The session that comes after `kind` this round, or null after the management phase. */
export function nextSession(season: number, round: number, kind: SessionKind): SessionKind | null {
  const sessions = weekendSessions(season, round);
  return sessions[sessions.indexOf(kind) + 1] ?? null;
}

/** What sets the grid of a race or sprint. */
export function gridSource(season: number, round: number, race: 'sprint' | 'race'): 'qualifying' | 'sprint-qualifying' | 'sprint' {
  if (!isSprintRound(season, round)) return 'qualifying';
  if (season <= 2022) return race === 'race' ? 'sprint' : 'qualifying';
  return race === 'race' ? 'qualifying' : 'sprint-qualifying';
}

/** A session's name as the season called it. */
export function sessionName(season: number, kind: SessionKind): string {
  switch (kind) {
    case 'practice':
      return 'Practice';
    case 'sprint-qualifying':
      return season === 2023 ? 'Sprint shootout' : 'Sprint qualifying';
    case 'qualifying':
      return 'Qualifying';
    case 'sprint':
      return 'Sprint';
    case 'race':
      return 'Race';
    case 'management':
      return 'Between races';
  }
}
