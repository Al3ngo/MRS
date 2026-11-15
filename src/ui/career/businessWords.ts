/**
 * The words of the team's business: names and one plain line for every part, role, trait,
 * sponsor deal and challenge, and the news of a management phase.
 */
import { ENGINE_MAKERS } from '../../game/data';
import type { Quality } from '../../game/season/business';
import type { Challenge, ChallengeKind, PartId, SponsorDeal, StaffRole, TraitId } from '../../game/team';
import { ordinal } from '../race/Result';
import { driverName, teamLabel } from './names';

/** Money as the game shows it: one decimal only when there is one. */
export const cash = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

export const PART_NAMES: Readonly<Record<PartId, string>> = {
  aero: 'Aero',
  chassis: 'Chassis',
  engine: 'Engine',
  battery: 'Battery',
  recovery: 'Energy recovery',
};

export function partLine(part: PartId, season: number): string {
  switch (part) {
    case 'aero':
      return 'Wings and floor: grip in fast corners.';
    case 'chassis':
      return 'The car itself: how it rides, turns and treats its tyres, at every circuit.';
    case 'engine':
      return season <= 2013 ? 'Power on the straights.' : 'The combustion engine: most of the power on the straights.';
    case 'battery':
      return season <= 2013 ? 'Stores the KERS boost.' : 'Stores the electric power the car harvests.';
    case 'recovery':
      return season <= 2013
        ? 'KERS: saves energy under braking for the boost button.'
        : season <= 2025
          ? 'Harvests energy under braking and from the exhaust.'
          : 'Harvests energy under braking: half the car’s power is electric now.';
  }
}

export const QUALITY_NAMES: Readonly<Record<Quality, string>> = {
  aero: 'Aero',
  chassis: 'Chassis',
  power: 'Power',
  reliability: 'Reliability',
};

export const QUALITY_LINES: Readonly<Record<Quality, string>> = {
  aero: 'Grip in the corners. Counts most at twisty circuits.',
  chassis: 'Counts everywhere.',
  power: 'Speed on the straights. Counts most at fast circuits.',
  reliability: 'How rarely the car breaks down.',
};

export const ROLE_NAMES: Readonly<Record<StaffRole, string>> = {
  'technical-director': 'Technical director',
  aerodynamicist: 'Aerodynamicist',
  'race-engineer': 'Race engineer',
  strategist: 'Strategist',
  'pit-crew-chief': 'Pit crew chief',
};

export const ROLE_LINES: Readonly<Record<StaffRole, string>> = {
  'technical-director': 'Designs the new parts: how much each one gains, and how reliable it is.',
  aerodynamicist: 'Extra pace from new aero parts, and from work on next year’s car.',
  'race-engineer': 'Starts the setup closer to right, and makes the driver’s feedback clearer.',
  strategist: 'Reads the weather further ahead, and makes better calls when the team runs a car.',
  'pit-crew-chief': 'Quicker, surer pit stops.',
};

export const TRAIT_NAMES: Readonly<Record<TraitId, string>> = {
  innovator: 'Innovator',
  meticulous: 'Meticulous',
  thrifty: 'Thrifty',
  rising: 'Rising star',
  veteran: 'Veteran',
  demanding: 'Demanding',
  'rain-reader': 'Rain reader',
  calm: 'Calm',
};

export function traitLine(trait: TraitId, role: StaffRole): string {
  switch (trait) {
    case 'innovator':
      return 'New parts gain more.';
    case 'meticulous':
      return role === 'pit-crew-chief' ? 'Fewer slow stops.' : 'New parts lose less reliability.';
    case 'thrifty':
      return 'Upgrades cost 2 instead of 3.';
    case 'rising':
      return 'Gets better every season.';
    case 'veteran':
      return 'Fades a little every season.';
    case 'demanding':
      return 'Asks more money, and wants the going rate to renew.';
    case 'rain-reader':
      return 'Reads the weather even further ahead.';
    case 'calm':
      return 'Quicker, steadier stops.';
  }
}

/** How good someone is at the job, in a word. */
export function skillWord(skill: number): string {
  if (skill >= 88) return 'outstanding';
  if (skill >= 75) return 'very good';
  if (skill >= 60) return 'good';
  if (skill >= 45) return 'average';
  return 'weak';
}

export const TIER_NAMES: Readonly<Record<SponsorDeal['tier'], string>> = {
  steady: 'Steady',
  balanced: 'Balanced',
  bold: 'Bold',
};

/** "A car in the top 6." */
export const targetWords = (target: number): string => (target === 1 ? 'a win' : `a car finishing ${ordinal(target)} or better`);

export function challengeWords(challenge: Challenge, season: number): string {
  const kinds: Record<ChallengeKind, () => string> = {
    'car-top': () => (challenge.target === 1 ? 'Win the race.' : `Finish a car ${ordinal(challenge.target)} or better.`),
    'both-points': () => 'Both cars finish in the points (the top ten).',
    'gain-places': () => `A car finishes ${challenge.target} or more places higher than it started.`,
    'beat-team': () => `Both cars finish ahead of both ${challenge.rival ? teamLabel(challenge.rival, season).name : 'rival'} cars.`,
    'both-finish': () => 'Both cars reach the finish.',
    'grid-top': () => `Start a car ${ordinal(challenge.target)} or better on the grid.`,
  };
  return kinds[challenge.kind]();
}

export const engineMakerName = (maker: string): string => ENGINE_MAKERS.find((entry) => entry.id === maker)?.name ?? maker;

/** A line of news from the team's business, in plain words. */
export function newsWords(item: string, drivers: readonly string[]): string | null {
  const [kind, ...rest] = item.split(':');
  switch (kind) {
    case 'challenge': {
      const [result, reward] = rest;
      return result === 'met' ? `Sponsor challenge met: +${reward}.` : 'Sponsor challenge missed.';
    }
    case 'unit': {
      const [seat, part, places] = rest;
      const who = drivers[Number(seat)] ? driverName(drivers[Number(seat)]!) : 'A car';
      const what = part === 'engine' ? 'engine' : 'battery';
      return Number(places) > 0
        ? `${who}'s ${what} was worn out and has been replaced: past the allowance, so ${places} places back on the grid at the next race.`
        : `${who}'s ${what} was worn out and has been replaced, within the allowance.`;
    }
    case 'built': {
      const [part, gain] = rest;
      return `New ${PART_NAMES[part as PartId]?.toLowerCase() ?? part} fitted: about +${gain} pace.`;
    }
    case 'lost': {
      const [id] = rest;
      return `${driverName(id!)} died after a crash. Sign a driver without a seat before the next race.`;
    }
    case 'retired':
      return `${rest.join(':').split(',').map(driverName).join(' and ')} retired: a seat to fill.`;
    case 'cap': {
      const [over, factor] = rest;
      return `Over last season's budget cap by ${over}: fined, and development ${Number(factor) <= 0.75 ? 'a quarter' : 'a tenth'} slower this season.`;
    }
    default:
      return null;
  }
}
