/**
 * Power units against the season's allowance.
 *
 * Each car may use a set number of engines a season (to 2013 the whole engine; from 2014 the
 * combustion engine) and, from 2014, of batteries. Every weekend wears the fitted ones: practice
 * and qualifying a fixed amount, the race as hard as it was driven (engine modes, laps). A worn-out
 * unit is replaced before the next weekend, and the team can fit a new one early. Going past the
 * allowance costs grid places at the next Grand Prix: 10 for each extra engine to 2013; from 2014,
 * 10 for the first extra of each kind in a season and 5 for each one after.
 *
 * A unit's life is set so that a car driven at the standard engine mode all year, sprints and all,
 * just fits its allowance; pushing hard does not. Older units break down more often: the race
 * engine reads the age.
 */
import { calendar, rulesFor } from '../data';
import type { UnitState } from './types';

/** Practice and qualifying, in race distances of wear. */
export const WEEKEND_WEAR = 0.6;

export const freshUnits = (season: number): UnitState => ({
  engineWear: 0,
  engines: 1,
  batteryWear: 0,
  batteries: rulesFor(season).batteryAllowance === null ? 0 : 1,
});

/** Headroom in a unit's life: a season driven at the standard mode, sprints included, fits the allowance. */
const HEADROOM = 1.1;

/** Race distances a unit lasts. */
export function unitLife(season: number, kind: 'engine' | 'battery'): number {
  const rules = rulesFor(season);
  const allowance = kind === 'engine' ? rules.engineAllowance : rules.batteryAllowance;
  if (allowance === null) return Infinity;
  return (calendar(season).length * (1 + WEEKEND_WEAR) * HEADROOM) / allowance;
}

/** How worn the fitted engine is, 0 (new) to 1 (done). */
export const engineWorn = (unit: UnitState, season: number): number => Math.min(1, unit.engineWear / unitLife(season, 'engine'));
export const batteryWorn = (unit: UnitState, season: number): number =>
  Math.min(1, unit.batteryWear / unitLife(season, 'battery'));

/**
 * The age the race engine reads. Its own cars run at 0.3 all year; scaled like this, a unit used
 * from new to worn out is as likely to fail over its life as one of theirs.
 */
export const raceEngineAge = (unit: UnitState, season: number): number =>
  0.55 * Math.max(engineWorn(unit, season), batteryWorn(unit, season));

/** A weekend's wear: practice and qualifying, then the race (`raced`, in race distances). */
export function wearUnits(unit: UnitState, raced: number, season: number): UnitState {
  const hybrid = rulesFor(season).batteryAllowance !== null;
  const wear = WEEKEND_WEAR + Math.max(0, raced);
  return {
    ...unit,
    engineWear: unit.engineWear + wear,
    batteryWear: hybrid ? unit.batteryWear + wear : 0,
  };
}

/** Grid places for fitting one more unit of a kind, the `count`-th of the season. */
export function penaltyForUnit(kind: 'engine' | 'battery', count: number, season: number): number {
  const rules = rulesFor(season);
  const allowance = kind === 'engine' ? rules.engineAllowance : rules.batteryAllowance;
  if (allowance === null || count <= allowance) return 0;
  if (season <= 2013) return 10;
  return count === allowance + 1 ? 10 : 5;
}

/** Fits a new unit. Returns the car's units and the grid places it costs. */
export function fitNew(unit: UnitState, kind: 'engine' | 'battery', season: number): { unit: UnitState; places: number } {
  if (kind === 'engine') {
    const engines = unit.engines + 1;
    return { unit: { ...unit, engines, engineWear: 0 }, places: penaltyForUnit('engine', engines, season) };
  }
  const batteries = unit.batteries + 1;
  return { unit: { ...unit, batteries, batteryWear: 0 }, places: penaltyForUnit('battery', batteries, season) };
}

/** Replaces whatever is worn out. Returns the units, the grid places, and what was fitted. */
export function replaceWorn(unit: UnitState, season: number): { unit: UnitState; places: number; fitted: ('engine' | 'battery')[] } {
  let current = unit;
  let places = 0;
  const fitted: ('engine' | 'battery')[] = [];
  if (current.engineWear >= unitLife(season, 'engine')) {
    const result = fitNew(current, 'engine', season);
    current = result.unit;
    places += result.places;
    fitted.push('engine');
  }
  if (rulesFor(season).batteryAllowance !== null && current.batteryWear >= unitLife(season, 'battery')) {
    const result = fitNew(current, 'battery', season);
    current = result.unit;
    places += result.places;
    fitted.push('battery');
  }
  return { unit: current, places, fitted };
}
