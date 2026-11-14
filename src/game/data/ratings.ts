/**
 * Driver ratings: the game's own assessment of every real driver, 0 to 100.
 *
 * ASSESSMENTS, not facts. Each driver is rated at his peak; `ratingsAt` works out what he is worth
 * at a given age. These are balance values and will be tuned as the game is played.
 *
 *   pace         raw speed over one lap
 *   racecraft    overtaking, defending, starts
 *   consistency  how rarely he makes a mistake
 *   tyres        how well he looks after them
 *   wet          skill in the rain
 *   aggression   how much risk he takes; neither good nor bad in itself
 */
import type { DriverFact } from './types';

export interface Ratings {
  pace: number;
  racecraft: number;
  consistency: number;
  tyres: number;
  wet: number;
  aggression: number;
}

export interface DriverProfile {
  peak: Ratings;
  /** Ages between which he is at his peak. Before, he is still learning; after, he fades. */
  prime: readonly [number, number];
}

const DEFAULT_PRIME: readonly [number, number] = [25, 32];

/** pace, racecraft, consistency, tyres, wet, aggression, then optionally the prime years. */
type Row = readonly [number, number, number, number, number, number, number?, number?];

const ROWS: Readonly<Record<string, Row>> = {
  // On the grid, or free to sign, in 2010
  'sebastian-vettel': [96, 90, 93, 92, 93, 70, 22, 30],
  'fernando-alonso': [96, 98, 97, 94, 94, 80, 24, 36],
  'lewis-hamilton': [97, 96, 94, 95, 97, 76, 22, 35],
  'jenson-button': [90, 91, 93, 96, 97, 48, 26, 33],
  'mark-webber': [91, 85, 86, 85, 86, 72, 28, 34],
  'nico-rosberg': [92, 86, 91, 89, 82, 62, 24, 31],
  'michael-schumacher': [98, 97, 96, 93, 99, 85, 25, 31],
  'felipe-massa': [88, 84, 83, 82, 70, 64, 25, 30],
  'robert-kubica': [94, 93, 91, 88, 91, 75, 23, 32],
  'rubens-barrichello': [89, 87, 88, 88, 92, 52, 26, 34],
  'nico-hulkenberg': [89, 86, 88, 87, 91, 60, 24, 34],
  'kamui-kobayashi': [84, 90, 78, 80, 80, 88],
  'adrian-sutil': [83, 78, 76, 78, 86, 72],
  'vitantonio-liuzzi': [79, 77, 76, 76, 76, 62],
  'sebastien-buemi': [82, 80, 81, 80, 80, 58],
  'jaime-alguersuari': [81, 79, 79, 82, 76, 60],
  'jarno-trulli': [88, 76, 82, 78, 78, 40],
  'heikki-kovalainen': [85, 79, 82, 80, 79, 52],
  'timo-glock': [84, 82, 84, 82, 84, 55],
  'lucas-di-grassi': [77, 78, 78, 80, 74, 58],
  'bruno-senna': [77, 75, 75, 75, 74, 55],
  'karun-chandhok': [71, 72, 74, 73, 72, 45],
  'sakon-yamamoto': [67, 66, 68, 68, 66, 55],
  'christian-klien': [78, 76, 78, 77, 76, 50],
  'pedro-de-la-rosa': [82, 80, 84, 82, 80, 55, 26, 33],
  'nick-heidfeld': [87, 86, 91, 88, 88, 45, 25, 33],
  'vitaly-petrov': [80, 79, 76, 77, 76, 66],
  'kimi-raikkonen': [94, 89, 91, 93, 84, 52, 22, 33],
  'romain-grosjean': [90, 80, 78, 83, 78, 86],
  'narain-karthikeyan': [72, 70, 70, 70, 74, 62],

  // Debuts from 2011
  'daniel-ricciardo': [92, 96, 89, 89, 87, 80, 24, 30],
  'sergio-perez': [87, 88, 85, 96, 82, 68, 24, 33],
  'pastor-maldonado': [85, 72, 62, 72, 74, 97],
  'paul-di-resta': [84, 82, 85, 83, 82, 52],
  'jerome-dambrosio': [76, 76, 78, 77, 75, 50],
  'jean-eric-vergne': [84, 84, 82, 82, 88, 68],
  'charles-pic': [76, 75, 78, 77, 74, 48],
  'valtteri-bottas': [91, 83, 89, 86, 84, 50, 24, 33],
  'esteban-gutierrez': [78, 74, 74, 76, 72, 66],
  'jules-bianchi': [89, 87, 86, 85, 88, 66],
  'max-chilton': [73, 72, 82, 76, 72, 38],
  'giedo-van-der-garde': [75, 75, 75, 75, 78, 60],
  'kevin-magnussen': [85, 86, 82, 82, 84, 90],
  'daniil-kvyat': [85, 80, 78, 80, 80, 84],
  'marcus-ericsson': [79, 78, 79, 80, 76, 55],
  'andre-lotterer': [80, 82, 84, 82, 82, 55],
  'will-stevens': [73, 72, 76, 74, 72, 48],
  'max-verstappen': [99, 98, 96, 93, 98, 90, 21, 33],
  'carlos-sainz-jr': [91, 90, 91, 90, 88, 66, 24, 33],
  'felipe-nasr': [80, 79, 80, 80, 80, 55],
  'roberto-merhi': [74, 73, 74, 74, 76, 55],
  'alexander-rossi': [77, 78, 78, 78, 76, 62],
  'esteban-ocon': [88, 86, 87, 87, 88, 82],
  'jolyon-palmer': [77, 75, 74, 76, 74, 58],
  'pascal-wehrlein': [84, 80, 81, 80, 86, 56],
  'rio-haryanto': [72, 72, 72, 73, 72, 55],
  'stoffel-vandoorne': [84, 82, 84, 83, 82, 50],
  'lance-stroll': [84, 84, 80, 83, 90, 66],
  'pierre-gasly': [89, 86, 87, 86, 87, 68],
  'antonio-giovinazzi': [82, 78, 79, 79, 78, 56],
  'brendon-hartley': [79, 78, 80, 80, 80, 50],
  'charles-leclerc': [97, 90, 88, 87, 87, 78, 23, 33],
  'sergey-sirotkin': [78, 76, 78, 77, 76, 50],
  'lando-norris': [96, 90, 92, 91, 92, 58, 23, 33],
  'george-russell': [94, 89, 92, 89, 89, 76, 23, 33],
  'alexander-albon': [89, 89, 88, 90, 86, 60],
  'nicholas-latifi': [75, 73, 74, 76, 72, 50],
  'jack-aitken': [75, 74, 75, 75, 74, 52],
  'pietro-fittipaldi': [72, 72, 74, 74, 72, 50],
  'yuki-tsunoda': [87, 83, 81, 83, 82, 82],
  'mick-schumacher': [81, 79, 77, 80, 80, 62],
  'nikita-mazepin': [72, 68, 66, 70, 68, 86],
  'guanyu-zhou': [82, 81, 84, 83, 80, 50],
  'nyck-de-vries': [81, 80, 81, 81, 80, 54],
  'oscar-piastri': [95, 92, 93, 90, 86, 66, 23, 33],
  'logan-sargeant': [77, 73, 70, 74, 72, 60],
  'liam-lawson': [85, 85, 82, 83, 84, 84],
  'oliver-bearman': [88, 86, 83, 84, 86, 74],
  'franco-colapinto': [84, 82, 76, 80, 80, 76],
  'jack-doohan': [79, 77, 76, 78, 76, 62],
  'kimi-antonelli': [93, 86, 85, 85, 88, 72, 22, 33],
  'gabriel-bortoleto': [88, 86, 87, 87, 84, 60],
  'isack-hadjar': [90, 86, 86, 86, 88, 72],
  'arvid-lindblad': [88, 85, 82, 83, 84, 74],
  'rafael-camara': [84, 82, 82, 82, 80, 62],
  'ryo-hirakawa': [78, 80, 82, 82, 80, 48],
};

export const PROFILES: Readonly<Record<string, DriverProfile>> = Object.fromEntries(
  Object.entries(ROWS).map(([id, [pace, racecraft, consistency, tyres, wet, aggression, from, to]]) => [
    id,
    {
      peak: { pace, racecraft, consistency, tyres, wet, aggression },
      prime: from !== undefined && to !== undefined ? [from, to] : DEFAULT_PRIME,
    } satisfies DriverProfile,
  ]),
);

/** Points a rating is short of its peak for each year before the prime, and the most it can be short. */
const LEARNING: Readonly<Record<keyof Ratings, readonly [perYear: number, most: number]>> = {
  pace: [1.8, 7],
  racecraft: [2, 10],
  consistency: [2.2, 11],
  tyres: [2, 10],
  wet: [1, 5],
  aggression: [0, 0],
};

/** Points a rating loses for each year after the prime. Speed goes first; craft lasts. */
const FADING: Readonly<Record<keyof Ratings, number>> = {
  pace: 1.3,
  racecraft: 0.5,
  consistency: 0.7,
  tyres: 0.3,
  wet: 0.6,
  aggression: 0.8,
};

/** A driver's age on 1 July of a season, in whole years. */
export function ageIn(driver: Pick<DriverFact, 'born'>, season: number): number {
  const [year, month] = driver.born.split('-').map(Number) as [number, number];
  return season - year - (month > 6 ? 1 : 0);
}

/** What a driver is worth at a given age: below his peak while learning, and again once he fades. */
export function ratingsAtAge(profile: DriverProfile, age: number): Ratings {
  const [from, to] = profile.prime;
  const out = {} as Ratings;
  for (const key of Object.keys(profile.peak) as (keyof Ratings)[]) {
    let value = profile.peak[key];
    if (age < from) value -= Math.min(LEARNING[key][1], (from - age) * LEARNING[key][0]);
    if (age > to) value -= (age - to) * FADING[key];
    out[key] = Math.max(1, Math.round(value));
  }
  return out;
}

/** One number for sorting a driver list: speed counts most, aggression not at all. */
export function overall(ratings: Ratings): number {
  return Math.round(
    ratings.pace * 0.4 + ratings.racecraft * 0.2 + ratings.consistency * 0.2 + ratings.tyres * 0.1 + ratings.wet * 0.1,
  );
}
