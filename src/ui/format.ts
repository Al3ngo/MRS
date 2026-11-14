/** Wording and number formats shared by the screens. */
import type { CareerSummary } from '../game/career';
import { sessionName } from '../game/season/weekend';

/** What comes next in a career, in words: "Qualifying next", "Sprint shootout next". */
export const nextLabel = (summary: Pick<CareerSummary, 'phase' | 'seasonYear' | 'team'>): string =>
  summary.team === null
    ? 'Choose a team'
    : summary.phase === 'management'
      ? 'Between races'
      : `${sessionName(summary.seasonYear, summary.phase)} next`;

/** "Round 3 of 19" */
export const roundLabel = (summary: Pick<CareerSummary, 'round' | 'rounds'>): string =>
  `Round ${summary.round} of ${summary.rounds}`;

/** Sizes as a person would say them: 312 B, 4.2 kB, 1.3 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0)} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** A lap time: 1:23.456. */
export function formatLap(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6, '0')}`;
}

/** A race time: 1:32:45.6. */
export function formatRaceTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds - hours * 3600) / 60);
  const rest = (seconds - hours * 3600 - minutes * 60).toFixed(1).padStart(4, '0');
  return `${hours}:${String(minutes).padStart(2, '0')}:${rest}`;
}

/** A gap to the car ahead or the winner: +4.2s, +1:04.9. */
export function formatGap(seconds: number): string {
  if (seconds < 60) return `+${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `+${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, '0')}`;
}

const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** The time of day, in the phone's own 12 or 24 hour style. */
export const formatClock = (iso: string): string => clock.format(new Date(iso));

/** When something was saved, relative to now: "today at 18:42", "yesterday at 09:10", "3 Nov at 21:15", "3 Nov 2025". */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (days === 0) return `today at ${clock.format(then)}`;
  if (days === 1) return `yesterday at ${clock.format(then)}`;
  if (then.getFullYear() === now.getFullYear()) return `${dayMonth.format(then)} at ${clock.format(then)}`;
  return dayMonthYear.format(then);
}

/** One line saying where a career stands: "season 2012, round 7 of 20". */
export function describePosition(summary: CareerSummary): string {
  if (summary.finished) return `season ${summary.seasonYear}, career complete`;
  return `season ${summary.seasonYear}, round ${summary.round} of ${summary.rounds}`;
}
