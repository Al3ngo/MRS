/**
 * How each team runs its race: its pit wall's temperament.
 *
 * Every car the simulation runs is managed by the same pit wall, under the same rules as the
 * player's: push levels, engine and battery modes, pit stops, tyre calls for the weather. A style
 * only moves the thresholds those calls are made at. Balanced is the pit wall as it always was;
 * aggressive pushes sooner and longer and gambles on tyres and weather; cautious nurses the car,
 * the driver and the tyres, and plays the weather safe.
 */
import type { Approach } from './qualifying';
import type { Entrant, TeamStyle } from './types';

export interface StyleRules {
  /** Stress at which the driver is told to conserve; he keeps conserving until it falls below 25. */
  conserveAbove: number;
  /** Tyre wear at which a driver nurses his tyres to a stop more than three laps away. */
  nurseTyresAt: number;
  /** All-out is used for a pass in the last this-many laps... */
  allOutLaps: number;
  /** ...within this many seconds of the car ahead... */
  allOutGap: number;
  /** ...and while stress is below this. */
  allOutStress: number;
  /** Laps stuck right behind a car before the driver is told to push. */
  pushAfterLaps: number;
  /** He is told to push only while stress is below this... */
  pushStress: number;
  /** ...and keeps pushing while still close and below this. */
  keepPushStress: number;
  /** The engine is pushed only while it is no older than this (0 new, 1 at the end of its life)... */
  enginePushAge: number;
  /** ...with this many laps of fuel to spare in a fight... */
  enginePushSpareClose: number;
  /** ...or this many at any time. */
  enginePushSpare: number;
  /** Battery charge needed to use the overtake boost (hybrid years). */
  overtakeCharge: number;
  /** Battery charge needed to use attack mode in defence. */
  defendCharge: number;
  /** Charge below which a car in clear air harvests. */
  harvestBelow: number;
  /** Charge needed to fire the KERS boost in a fight. */
  kersCharge: number;
  /** Added to the time a tyre change for the weather must gain before it is made: negative calls it sooner. */
  rainNerve: number;
  /** Seconds a stop behind the safety car must save to be worth making. */
  cheapStopMargin: number;
  /** Tyre wear at which worn tyres are changed ahead of the plan. */
  changeWornAt: number;
  /** Wear the tyres may reach by the flag before a stop is added to a plan with none left. */
  stretchTo: number;
  /** How hard each driver goes in each part of qualifying. */
  qualifying: readonly [Approach, Approach, Approach];
}

export const STYLES: Readonly<Record<TeamStyle, StyleRules>> = {
  // The pit wall as it was before styles: its numbers must not change.
  balanced: {
    conserveAbove: 55,
    nurseTyresAt: 0.9,
    allOutLaps: 2,
    allOutGap: 0.6,
    allOutStress: 40,
    pushAfterLaps: 3,
    pushStress: 30,
    keepPushStress: 45,
    enginePushAge: 0.8,
    enginePushSpareClose: 0.3,
    enginePushSpare: 0.8,
    overtakeCharge: 20,
    defendCharge: 25,
    harvestBelow: 35,
    kersCharge: 50,
    rainNerve: 0,
    cheapStopMargin: 3,
    changeWornAt: 1.3,
    stretchTo: 1.35,
    qualifying: ['normal', 'normal', 'normal'],
  },
  aggressive: {
    conserveAbove: 65,
    nurseTyresAt: 1,
    allOutLaps: 4,
    allOutGap: 0.9,
    allOutStress: 50,
    pushAfterLaps: 1.5,
    pushStress: 40,
    keepPushStress: 55,
    enginePushAge: 0.9,
    enginePushSpareClose: 0.2,
    enginePushSpare: 0.5,
    overtakeCharge: 15,
    defendCharge: 20,
    harvestBelow: 30,
    kersCharge: 40,
    rainNerve: -0.008,
    cheapStopMargin: 1,
    changeWornAt: 1.4,
    stretchTo: 1.45,
    qualifying: ['normal', 'push', 'push'],
  },
  cautious: {
    conserveAbove: 45,
    nurseTyresAt: 0.8,
    allOutLaps: 0,
    allOutGap: 0,
    allOutStress: 0,
    pushAfterLaps: 5,
    pushStress: 20,
    keepPushStress: 35,
    enginePushAge: 0.6,
    enginePushSpareClose: 0.5,
    enginePushSpare: 1.2,
    overtakeCharge: 30,
    defendCharge: 30,
    harvestBelow: 45,
    kersCharge: 60,
    rainNerve: 0.01,
    cheapStopMargin: 6,
    changeWornAt: 1.15,
    stretchTo: 1.25,
    qualifying: ['safe', 'normal', 'normal'],
  },
};

/** The style a car's pit wall works to. Entrants made before styles existed are balanced. */
export const styleOf = (entrant: Pick<Entrant, 'style'>): StyleRules => STYLES[entrant.style ?? 'balanced'];
