/**
 * The tyres of a weekend: which compounds are brought, how quick each is and how long it lasts.
 *
 * The eras are the point. Bridgestone's 2010 tyres would go most of a race; Pirelli's first tyres
 * (2011 to 2013) were built to wear out and forced two or three stops; from 2017 a single stop was
 * usual again. Life is set as a share of the race distance, so it holds at long and short circuits.
 */
import { WET_COMPOUNDS, rulesFor } from '../data/regulations';
import type { Compound, SessionSetup } from './types';

export interface TyreEra {
  /** Last season of the era. */
  until: number;
  /** Life of the softest tyre brought, as a share of the Grand Prix distance. */
  softLife: number;
  /** Extra life of each harder step. */
  lifeStep: number;
  /** Lap time each harder step costs. */
  paceStep: number;
  /** Lap time a tyre has lost by the end of its life. */
  fade: number;
}

/** Balance values, one row per generation of tyre. */
export const TYRE_ERAS: TyreEra[] = [
  { until: 2010, softLife: 0.5, lifeStep: 0.45, paceStep: 0.004, fade: 0.008 },
  { until: 2013, softLife: 0.21, lifeStep: 0.15, paceStep: 0.0075, fade: 0.016 },
  { until: 2016, softLife: 0.27, lifeStep: 0.16, paceStep: 0.007, fade: 0.016 },
  { until: 2018, softLife: 0.36, lifeStep: 0.22, paceStep: 0.006, fade: 0.01 },
  { until: 2021, softLife: 0.32, lifeStep: 0.23, paceStep: 0.0055, fade: 0.012 },
  { until: 2099, softLife: 0.31, lifeStep: 0.23, paceStep: 0.0055, fade: 0.013 },
];

const era = (season: number): TyreEra => TYRE_ERAS.find((row) => season <= row.until)!;

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z]+/g, '-');

/**
 * The compounds for a race: the season's dry tyres chosen to suit the circuit (harder where the
 * circuit is hard on tyres), softest first, then the intermediate and the wet.
 */
export function compoundsFor(
  season: number,
  traits: Pick<SessionSetup['traits'], 'tyreWear'>,
  fullDistanceLaps: number,
): Compound[] {
  const rules = rulesFor(season);
  const { softLife, lifeStep, paceStep, fade } = era(season);
  const range = rules.dryCompounds;
  const count = rules.compoundsPerRace;
  const first = Math.round(((traits.tyreWear - 1) / 4) * (range.length - count));
  const circuit = 1.18 - 0.06 * traits.tyreWear;

  const dry = range.slice(first, first + count).map((tyre, step): Compound => {
    // Bridgestone marked the softer tyre of the two with a green stripe and left the other plain.
    const colour = season === 2010 ? (step === 0 ? '#52c26a' : '#f2f2f2') : tyre.colour;
    return {
      id: slug(tyre.name),
      name: tyre.name,
      colour,
      kind: 'dry',
      pace: step * paceStep,
      life: Math.max(4, (softLife + step * lifeStep) * circuit * fullDistanceLaps),
      fade,
    };
  });

  const [inter, wet] = WET_COMPOUNDS;
  return [
    ...dry,
    { id: 'intermediate', name: inter!.name, colour: inter!.colour, kind: 'inter', pace: 0, life: 0.5 * fullDistanceLaps, fade: 0.012 },
    { id: 'wet', name: wet!.name, colour: wet!.colour, kind: 'wet', pace: 0, life: 0.65 * fullDistanceLaps, fade: 0.012 },
  ];
}

export function compound(setup: SessionSetup, id: string): Compound {
  for (const candidate of setup.compounds) if (candidate.id === id) return candidate;
  throw new RangeError(`No compound ${id} at this race`);
}

export const dryCompounds = (setup: SessionSetup): Compound[] => setup.compounds.filter((c) => c.kind === 'dry');

export function compoundOfKind(setup: SessionSetup, kind: Compound['kind']): Compound {
  for (const candidate of setup.compounds) if (candidate.kind === kind) return candidate;
  throw new RangeError(`No ${kind} tyre at this race`);
}
