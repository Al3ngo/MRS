import type { Standing } from '../../game/season/standings';
import { driverName, teamLabel } from './names';

type Row = Omit<Standing, 'counts'>;

/** A championship table: drivers' or constructors'. The player's team is raised. */
export function StandingsTable({
  rows,
  kind,
  season,
  team,
  limit,
  label,
}: {
  rows: readonly Row[];
  kind: 'drivers' | 'teams';
  season: number;
  team: string | null;
  limit?: number;
  label: string;
}) {
  const shown = limit === undefined ? rows : rows.filter((row, index) => index < limit || row.team === team);
  if (shown.length === 0) return <p class="list-note">No points scored yet.</p>;
  return (
    <ol class="standings" aria-label={label}>
      {shown.map((row) => {
        const colours = teamLabel(row.team, season);
        const name = kind === 'drivers' ? driverName(row.id) : colours.name;
        const note =
          kind === 'drivers'
            ? colours.name
            : row.wins > 0
              ? `${row.wins} ${row.wins === 1 ? 'win' : 'wins'}`
              : row.podiums > 0
                ? `${row.podiums} top-three ${row.podiums === 1 ? 'finish' : 'finishes'}`
                : '';
        return (
          <li key={row.id} class={`standing${row.team === team ? ' standing--mine' : ''}`}>
            <span class="figure standing__place">{row.position}</span>
            <span class="team__colour" style={{ background: colours.colour }} />
            <span class="round__text">
              <span class="round__name">{name}</span>
              {note && <span class="round__where">{note}</span>}
            </span>
            <span class="figure standing__points">{Number.isInteger(row.points) ? row.points : row.points.toFixed(1)}</span>
          </li>
        );
      })}
    </ol>
  );
}
