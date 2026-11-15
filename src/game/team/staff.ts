/**
 * The team's staff: one person in each of five roles, hired Golden Lap style. Each has a skill
 * and up to two traits, a salary and a contract. Staff are signed between seasons; one kept into a
 * new season keeps the salary they had (as in Golden Lap), however much they have improved.
 *
 *   Technical director   how much each new part gains, and how reliable it is
 *   Aerodynamicist       extra gain from new aero parts, and from work on next year's car
 *   Race engineer        how close the car's baseline setup is, and how clear the driver's feedback
 *   Strategist           how far ahead the weather forecast can be trusted, and the team's calls
 *   Pit crew chief       how quick and how sure the pit stops are
 */
import { teamSpending } from '../data';
import { between, chance, clamp, gaussian, random, seedFrom, wholeBetween, type Luck } from '../sim/rng';
import { money } from './money';
import { personName } from './names';
import type { Outfit, StaffMember, StaffRole, TraitId } from './types';

export const STAFF_ROLES: readonly StaffRole[] = [
  'technical-director',
  'aerodynamicist',
  'race-engineer',
  'strategist',
  'pit-crew-chief',
];

/** Traits each role can have. */
const ROLE_TRAITS: Readonly<Record<StaffRole, readonly TraitId[]>> = {
  'technical-director': ['innovator', 'meticulous', 'thrifty', 'rising', 'veteran', 'demanding'],
  aerodynamicist: ['innovator', 'meticulous', 'rising', 'veteran', 'demanding'],
  'race-engineer': ['rising', 'veteran', 'demanding'],
  strategist: ['rain-reader', 'rising', 'veteran', 'demanding'],
  'pit-crew-chief': ['calm', 'meticulous', 'rising', 'veteran', 'demanding'],
};

/** What someone asks a season, from their skill: about 7 for the very best, under 1 for a beginner. */
export function staffAsk(skill: number, traits: readonly TraitId[]): number {
  const base = 0.6 + 6.4 * Math.pow(clamp((skill - 20) / 75, 0, 1), 1.6);
  return money(Math.max(0.5, base * (traits.includes('demanding') ? 1.3 : 1)));
}

/** Each trait a role can have comes up about one time in six; nobody has more than two. */
const TRAIT_CHANCE = 0.17;

function traitsFor(luck: Luck, role: StaffRole, age: number): TraitId[] {
  // Rising stars are young, veterans are old; nobody is both.
  const allowed = ROLE_TRAITS[role].filter((trait) => !(trait === 'rising' && age > 45) && !(trait === 'veteran' && age < 50));
  return allowed.filter(() => chance(luck, TRAIT_CHANCE)).slice(0, 2);
}

function person(luck: Luck, id: string, role: StaffRole, skill: number, season: number, years: number): StaffMember {
  const { name, nationality } = personName(luck);
  const age = wholeBetween(luck, 31, 62);
  const traits = traitsFor(luck, role, age);
  const value = Math.round(clamp(skill, 15, 96));
  return { id, name, nationality, role, skill: value, traits, age, salary: staffAsk(value, traits), until: season + years - 1 };
}

/** The staff a team has when a career starts: as good as its money buys. */
export function startingStaff(team: string, season: number, seed: number): StaffMember[] {
  const luck: Luck = { rng: seedFrom(seed, 'staff', team, season) };
  const level = 35 + 50 * clamp((teamSpending(team, season) - 40) / 200, 0, 1);
  return STAFF_ROLES.map((role, index) =>
    person(luck, `${team}-${season}-${index}`, role, level + gaussian(luck) * 8, season, wholeBetween(luck, 1, 3)),
  );
}

/** People looking for work before a season: five for each role, a few of them very good. */
export function staffPool(season: number, seed: number): StaffMember[] {
  const luck: Luck = { rng: seedFrom(seed, 'pool', season) };
  const pool: StaffMember[] = [];
  for (const role of STAFF_ROLES) {
    for (let index = 0; index < 5; index++) {
      const skill = 28 + 66 * Math.pow(random(luck), 1.5);
      pool.push(person(luck, `pool-${season}-${role}-${index}`, role, skill, season, 1));
    }
  }
  return pool;
}

/** A year older: rising stars improve, veterans fade, and everyone drifts a little with age. */
export function ageStaff(member: StaffMember, luck: Luck): StaffMember {
  let change = between(luck, -1, 1);
  if (member.age < 40) change += 1;
  if (member.age > 55) change -= 1;
  if (member.traits.includes('rising')) change += 4;
  if (member.traits.includes('veteran')) change -= 3;
  return { ...member, age: member.age + 1, skill: Math.round(clamp(member.skill + change, 10, 98)) };
}

// ── What the staff do ───────────────────────────────────────────────────────────────────────

const holder = (outfit: Outfit, role: StaffRole): StaffMember | undefined => outfit.staff.find((member) => member.role === role);

/** Skill in a role, 0 to 100; an empty role counts as a weak stand-in. */
export const skillIn = (outfit: Outfit, role: StaffRole): number => holder(outfit, role)?.skill ?? 25;

const has = (outfit: Outfit, role: StaffRole, trait: TraitId): boolean => holder(outfit, role)?.traits.includes(trait) ?? false;

/** What an innovator adds to the gain of each new part. */
const INNOVATOR = 1.12;

/** How much a new part gains with a technical director of this skill: 1 at 50. */
export const designGainAt = (skill: number): number => 0.6 + (0.8 * skill) / 100;

/** Extra gain on new aero parts with an aerodynamicist of this skill: 1 at 50. */
export const aeroGainAt = (skill: number): number => 0.75 + (0.5 * skill) / 100;

/** How much a new part gains, from the technical director. */
export const designGain = (outfit: Outfit): number =>
  designGainAt(skillIn(outfit, 'technical-director')) * (has(outfit, 'technical-director', 'innovator') ? INNOVATOR : 1);

/** Extra gain on new aero parts, from the aerodynamicist. */
export const aeroGain = (outfit: Outfit): number =>
  aeroGainAt(skillIn(outfit, 'aerodynamicist')) * (has(outfit, 'aerodynamicist', 'innovator') ? INNOVATOR : 1);

/** Reliability a brand-new part loses, from the technical director. */
export const newPartFragility = (outfit: Outfit): number =>
  (8 - (6 * skillIn(outfit, 'technical-director')) / 100) * (has(outfit, 'technical-director', 'meticulous') ? 0.6 : 1);

/** Cost of an upgrade: 3, or 2 with a thrifty technical director. */
export const upgradeCost = (outfit: Outfit): number => (has(outfit, 'technical-director', 'thrifty') ? 2 : 3);

/** How far money put into next year's car goes, from the aerodynamicist: 1 for an average one. */
export const projectGain = (outfit: Outfit): number => 0.8 + (0.4 * skillIn(outfit, 'aerodynamicist')) / 100;

/** Help the race engineer gives the driver's feedback in practice (added to its precision). */
export const engineerHelp = (outfit: Outfit): number => (0.15 * skillIn(outfit, 'race-engineer')) / 100;

/** How far the engineers' baseline setup misses, from the race engineer: 14 for an average one. */
export const baselineSpread = (outfit: Outfit): number => 14 * (1.25 - (0.5 * skillIn(outfit, 'race-engineer')) / 100);

/** Pit crew rating for the race engine, from the pit crew chief. */
export const pitCrewRating = (outfit: Outfit): number =>
  clamp(45 + 0.55 * skillIn(outfit, 'pit-crew-chief') + (has(outfit, 'pit-crew-chief', 'calm') ? 4 : 0), 40, 97);

/** How sure the strategist's reading of the weather and the race is, 0 to 1. */
export const strategistSureness = (outfit: Outfit): number =>
  clamp(skillIn(outfit, 'strategist') / 100 + (has(outfit, 'strategist', 'rain-reader') ? 0.2 : 0), 0, 1);
