/**
 * The championships: drivers' and constructors', from the results of the rounds run so far.
 *
 * Points are the points each result paid under its season's rules (the race engine has already
 * applied the table, the fastest-lap point, double points and short-race scales). Ties are split
 * as the real rules split them: most wins, then most second places, and so on, counting Grands
 * Prix only.
 */

/** One car's result in a race or a sprint, as a career keeps it. */
export interface Finish {
  driver: string;
  team: string;
  /** Finishing position, 1-based, in the order of the classification. */
  position: number;
  points: number;
  classified: boolean;
  status: string;
  grid: number;
  fastestLap: boolean;
}

export interface RoundResult {
  round: number;
  race: Finish[];
  sprint: Finish[] | null;
  /** Driver on pole for the Grand Prix. */
  pole: string | null;
}

export interface Standing {
  /** A driver id or a team id. */
  id: string;
  position: number;
  points: number;
  wins: number;
  podiums: number;
  /** The team the driver raced for most recently, for a driver; the team itself, for a team. */
  team: string;
  /** Grand Prix finishes by position, for splitting ties: counts[0] is wins. */
  counts: number[];
}

const MAX_PLACES = 30;

function rank(rows: Map<string, Standing>): Standing[] {
  const list = [...rows.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    for (let place = 0; place < MAX_PLACES; place++) {
      const diff = (b.counts[place] ?? 0) - (a.counts[place] ?? 0);
      if (diff !== 0) return diff;
    }
    return a.id.localeCompare(b.id);
  });
  list.forEach((row, index) => {
    row.position = index + 1;
  });
  return list;
}

function blank(id: string, team: string): Standing {
  return { id, position: 0, points: 0, wins: 0, podiums: 0, team, counts: new Array<number>(MAX_PLACES).fill(0) };
}

function add(row: Standing, finish: Finish, grandPrix: boolean): void {
  row.points += finish.points;
  if (!grandPrix || !finish.classified) return;
  if (finish.position === 1) row.wins += 1;
  if (finish.position <= 3) row.podiums += 1;
  if (finish.position <= MAX_PLACES) row.counts[finish.position - 1]! += 1;
}

/** The drivers' championship. */
export function driverStandings(results: readonly RoundResult[]): Standing[] {
  const rows = new Map<string, Standing>();
  for (const result of results) {
    for (const [finishes, grandPrix] of [
      [result.sprint ?? [], false],
      [result.race, true],
    ] as const) {
      for (const finish of finishes) {
        const row = rows.get(finish.driver) ?? blank(finish.driver, finish.team);
        row.team = finish.team;
        add(row, finish, grandPrix);
        rows.set(finish.driver, row);
      }
    }
  }
  return rank(rows);
}

/** The constructors' championship: both cars' points count. */
export function teamStandings(results: readonly RoundResult[]): Standing[] {
  const rows = new Map<string, Standing>();
  for (const result of results) {
    for (const [finishes, grandPrix] of [
      [result.sprint ?? [], false],
      [result.race, true],
    ] as const) {
      for (const finish of finishes) {
        const row = rows.get(finish.team) ?? blank(finish.team, finish.team);
        add(row, finish, grandPrix);
        rows.set(finish.team, row);
      }
    }
  }
  return rank(rows);
}

/** Drops the tie-break counts, which a finished season does not need to keep. */
export const compact = (rows: readonly Standing[]): Omit<Standing, 'counts'>[] =>
  rows.map(({ counts: _counts, ...rest }) => rest);
