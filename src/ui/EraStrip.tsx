import { FIRST_SEASON, LAST_SEASON, RULES_RESET_SEASONS, type CareerSummary } from '../game/career';

const SEASONS: readonly number[] = Array.from({ length: LAST_SEASON - FIRST_SEASON + 1 }, (_, i) => FIRST_SEASON + i);
const LABELLED: readonly number[] = [...new Set([FIRST_SEASON, ...RULES_RESET_SEASONS, LAST_SEASON])];

/** How much of a season is behind the career: 0 to 1. */
function share(year: number, summary: CareerSummary | null): number {
  if (!summary) return 0;
  if (summary.finished || year < summary.seasonYear) return 1;
  if (year > summary.seasonYear) return 0;
  return summary.racesRun / summary.rounds;
}

/**
 * The game's whole span, 2010 to 2026, one segment per season, filled as far as a career has run.
 * Taller segments are the seasons that open with a rules reset. Pass null for an empty slot.
 */
export function EraStrip({ summary }: { summary: CareerSummary | null }) {
  const label = !summary
    ? `The game runs from ${FIRST_SEASON} to ${LAST_SEASON}. No seasons run yet.`
    : summary.finished
      ? `All seasons from ${FIRST_SEASON} to ${LAST_SEASON} are run.`
      : `In season ${summary.seasonYear} of ${FIRST_SEASON} to ${LAST_SEASON}, ${summary.racesRun} of ${summary.rounds} races run.`;

  return (
    <div class="era" role="img" aria-label={label}>
      {SEASONS.map((year, index) => {
        const filled = share(year, summary);
        const classes = ['era__season'];
        if (RULES_RESET_SEASONS.includes(year)) classes.push('era__season--reset');
        if (summary && !summary.finished && year === summary.seasonYear) classes.push('era__season--current');
        return (
          <span key={year} class={classes.join(' ')} style={{ gridColumn: index + 1 }}>
            {filled > 0 && <span class="era__fill" style={{ width: `${filled * 100}%` }} />}
          </span>
        );
      })}
      {LABELLED.map((year) => {
        const edge = year === FIRST_SEASON ? ' era__year--first' : year === LAST_SEASON ? ' era__year--last' : '';
        return (
          <span key={year} class={`era__year${edge}`} style={{ gridColumn: year - FIRST_SEASON + 1 }} aria-hidden="true">
            {year}
          </span>
        );
      })}
    </div>
  );
}
