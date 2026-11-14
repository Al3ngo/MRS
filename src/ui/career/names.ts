/** Names and colours for the ids a career keeps, as they were in a given season. */
import { TEAMS, driver as driverById, shownTeamName, teamColour } from '../../game/data';

const teams = new Map(TEAMS.map((team) => [team.id, team]));

export interface TeamLabel {
  name: string;
  colour: string;
}

/** A team as it was called and coloured in `season`; after its real exit, as it last was. */
export function teamLabel(team: string, season: number): TeamLabel {
  const fact = teams.get(team);
  if (!fact) return { name: team, colour: '#949494' };
  const year = Math.min(Math.max(season, fact.seasons[0]), fact.seasons[1]);
  const entry = fact.names.find((name) => name.from <= year && name.to >= year) ?? fact.names.at(-1)!;
  return { name: shownTeamName(entry.constructor, year, entry.name), colour: teamColour(team, year) };
}

export const driverName = (id: string): string => driverById(id).name;
export const driverLast = (id: string): string => driverById(id).lastName;
export const driverCode = (id: string): string => driverById(id).code;
