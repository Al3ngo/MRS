/**
 * Drivers the game makes up: young prospects each season, and racers to fill seats when the real
 * drivers run out (the brief: "when real drivers run out, generate fictional drivers procedurally
 * with names, nationalities, and potential").
 *
 * A made-up driver is rebuilt in full from its id: name, nationality, birthday, potential, ratings
 * and the age at which they will stop. So a career keeps only the ids, and every screen that looks
 * a driver up gets the same answer, on any device, from the save alone. The id says when the driver
 * appeared and of what kind: "fx-2019-p2-k3f9a" is the second prospect of 2019 in one career
 * (15 to 17 years old);
 * "fx-2021-r1-k3f9a" the first race-ready driver added in 2021 (21 to 26, near their best).
 */
import type { DriverProfile, Ratings } from './ratings';
import type { DriverFact } from './types';

export const isFictional = (id: string): boolean => id.startsWith('fx-');

/** A string's 32-bit FNV-1a hash. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** mulberry32: a small, fast, seeded generator, so a driver comes out the same every time. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nationalities that produce racing drivers, with names to match. Anyone can race. */
const PEOPLE: readonly { nationality: string; code: string; first: readonly string[]; last: readonly string[] }[] = [
  { nationality: 'British', code: 'GBR', first: ['Oliver', 'Isla', 'Harry', 'Freya', 'Jack', 'Millie', 'Archie', 'Esme'], last: ['Whitlock', 'Ashworth', 'Penhale', 'Corrie', 'Haddon', 'Brierley', 'Tolland', 'Grayson'] },
  { nationality: 'German', code: 'DEU', first: ['Lukas', 'Mila', 'Felix', 'Lena', 'Niklas', 'Hanna', 'Jonah', 'Clara'], last: ['Reinhart', 'Vossberg', 'Kranich', 'Lindauer', 'Adelmann', 'Strobel', 'Wendler', 'Hagedorn'] },
  { nationality: 'French', code: 'FRA', first: ['Hugo', 'Léa', 'Théo', 'Chloé', 'Mathis', 'Inès', 'Nathan', 'Manon'], last: ['Duval', 'Ferrand', 'Lacombe', 'Montier', 'Rivaud', 'Castagne', 'Bertrand-Ollé', 'Sauvignac'] },
  { nationality: 'Italian', code: 'ITA', first: ['Leonardo', 'Sofia', 'Tommaso', 'Aurora', 'Gabriele', 'Ginevra', 'Riccardo', 'Beatrice'], last: ['Martinelli', 'Ruggeri', 'Bassani', 'Ferrero-Lodi', 'Salvetti', 'Gallina', 'Mancuso', 'Pedrazzi'] },
  { nationality: 'Spanish', code: 'ESP', first: ['Pablo', 'Lucía', 'Álvaro', 'Paula', 'Mateo', 'Alba', 'Daniel', 'Irene'], last: ['Navarro', 'Echeverría', 'Llorente', 'Quesada', 'Ibarra', 'Montalbán', 'Soler', 'Carrasco'] },
  { nationality: 'Dutch', code: 'NLD', first: ['Daan', 'Tess', 'Sem', 'Julia', 'Thijs', 'Noor', 'Jesse', 'Fenna'], last: ['de Wit', 'Verhoeven', 'Kuipers', 'Brouwer', 'van Dam', 'Schouten', 'Mulder', 'Veenstra'] },
  { nationality: 'Finnish', code: 'FIN', first: ['Eetu', 'Aino', 'Onni', 'Venla', 'Leevi', 'Siiri', 'Elias', 'Ilona'], last: ['Virtanen', 'Karjalainen', 'Lehtonen', 'Salminen', 'Heikkilä', 'Rantanen', 'Koskela', 'Nieminen'] },
  { nationality: 'Danish', code: 'DNK', first: ['Magnus', 'Freja', 'Emil', 'Ida', 'Oskar', 'Asta', 'Viktor', 'Karla'], last: ['Lindholm', 'Søgaard', 'Kjeldsen', 'Brandt', 'Holm', 'Thygesen'] },
  { nationality: 'Belgian', code: 'BEL', first: ['Arthur', 'Louise', 'Victor', 'Elise', 'Jules', 'Marie'], last: ['Peeters', 'Dewaele', 'Maes', 'Vandamme', 'Lambrechts', 'Goossens'] },
  { nationality: 'Swiss', code: 'CHE', first: ['Noah', 'Lara', 'Luca', 'Nina', 'Levin', 'Elin'], last: ['Ammann', 'Brunner', 'Kälin', 'Zbinden', 'Graf', 'Meierhans'] },
  { nationality: 'Austrian', code: 'AUT', first: ['Maximilian', 'Anna', 'Jakob', 'Laura', 'Paul', 'Lea'], last: ['Gruber', 'Pichler', 'Steiner', 'Huber-Mair', 'Leitner', 'Wallner'] },
  { nationality: 'Polish', code: 'POL', first: ['Jakub', 'Zuzanna', 'Szymon', 'Hanna', 'Filip', 'Maja'], last: ['Nowicki', 'Zieliński', 'Kowalczyk', 'Wróblewski', 'Pawlak', 'Sobczak'] },
  { nationality: 'Swedish', code: 'SWE', first: ['William', 'Alice', 'Hugo', 'Maja', 'Elias', 'Wilma'], last: ['Lindqvist', 'Bergström', 'Sundberg', 'Ekholm', 'Hedlund', 'Wallin'] },
  { nationality: 'Brazilian', code: 'BRA', first: ['Miguel', 'Helena', 'Arthur', 'Alice', 'Heitor', 'Laura', 'Davi', 'Valentina'], last: ['Andrade', 'Moraes', 'Figueiredo', 'Bittencourt', 'Carvalho', 'Nogueira', 'Pimentel', 'Saraiva'] },
  { nationality: 'Argentine', code: 'ARG', first: ['Benjamín', 'Martina', 'Thiago', 'Catalina', 'Joaquín', 'Delfina'], last: ['Ferreyra', 'Aguirre', 'Castellano', 'Peralta', 'Benítez', 'Quiroga'] },
  { nationality: 'Mexican', code: 'MEX', first: ['Santiago', 'Ximena', 'Emiliano', 'Regina', 'Diego', 'Renata'], last: ['Villaseñor', 'Arriaga', 'Cárdenas', 'Olvera', 'Zamudio', 'Bustamante'] },
  { nationality: 'American', code: 'USA', first: ['Mason', 'Avery', 'Carter', 'Harper', 'Logan', 'Quinn', 'Hunter', 'Madison'], last: ['Delaney', 'Whitaker', 'Brennan', 'Holloway', 'Sutherland', 'Kincaid', 'Merritt', 'Calloway'] },
  { nationality: 'Canadian', code: 'CAN', first: ['Liam', 'Charlotte', 'Ethan', 'Olivia', 'Owen', 'Chloe'], last: ['Gagnon', 'MacLeod', 'Tremblay', 'Fraser', 'Bouchard', 'Ashcroft'] },
  { nationality: 'Australian', code: 'AUS', first: ['Lachlan', 'Matilda', 'Cooper', 'Ruby', 'Riley', 'Sienna'], last: ['Gillespie', 'Hargreaves', 'Mackenzie', 'Prowse', 'Talbot', 'Wilmot'] },
  { nationality: 'New Zealander', code: 'NZL', first: ['Nikau', 'Aria', 'Finn', 'Isla', 'Kahu', 'Mia'], last: ['Ngata', 'Rutherford', 'Carmody', 'Tapsell', 'Wiremu-Hart', 'Gallagher'] },
  { nationality: 'Japanese', code: 'JPN', first: ['Haruto', 'Yui', 'Sota', 'Hina', 'Ren', 'Akari', 'Kaito', 'Mio'], last: ['Okamura', 'Fujisaki', 'Nakahara', 'Kuroda', 'Ishikawa', 'Takeuchi', 'Arai', 'Sugimoto'] },
  { nationality: 'Chinese', code: 'CHN', first: ['Haoran', 'Xinyi', 'Zihan', 'Yutong', 'Junhao', 'Ruoxi'], last: ['Lin', 'Zhang', 'Huang', 'Xu', 'Liang', 'Tang'] },
  { nationality: 'Thai', code: 'THA', first: ['Krit', 'Ploy', 'Nattapong', 'Fah', 'Thanawat', 'Mint'], last: ['Srisuk', 'Chaiyaporn', 'Wongsakul', 'Rattanakorn', 'Boonmee', 'Saetang'] },
  { nationality: 'Indian', code: 'IND', first: ['Arjun', 'Ananya', 'Vihaan', 'Diya', 'Kabir', 'Ishita'], last: ['Mehta', 'Raghavan', 'Kapoor', 'Iyer', 'Malhotra', 'Bhatia'] },
  { nationality: 'Monegasque', code: 'MCO', first: ['Louis', 'Camille', 'Raphaël', 'Margaux'], last: ['Pastorelli', 'Giraudi', 'Boisson', 'Marsan'] },
  { nationality: 'Norwegian', code: 'NOR', first: ['Jakob', 'Nora', 'Henrik', 'Ingrid', 'Sander', 'Sofie'], last: ['Haugland', 'Solberg', 'Fjeld', 'Aasen', 'Lunde', 'Moen'] },
];

export interface FictionalDriver {
  fact: DriverFact;
  profile: DriverProfile;
  /** How good they will be at their best, as an overall rating. */
  potential: number;
  /** The age after which they stop racing. */
  retireAge: number;
  kind: 'prospect' | 'ready';
}

const cache = new Map<string, FictionalDriver>();

/** The season a made-up driver appeared, from the id. */
export const fictionalSeason = (id: string): number => Number(id.split('-')[1]);

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** Rebuilds a made-up driver from the id. Throws for an id that is not one. */
export function fictionalDriver(id: string): FictionalDriver {
  const found = cache.get(id);
  if (found) return found;
  if (!isFictional(id)) throw new RangeError(`${id} is not a made-up driver`);
  const season = fictionalSeason(id);
  const kind = id.split('-')[2]?.startsWith('p') ? 'prospect' : 'ready';
  const random = generator(hash(id));
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;

  const people = pick(PEOPLE);
  const firstName = pick(people.first);
  const lastName = pick(people.last);
  // Prospects arrive at 15 to 17, still in the junior series; race-ready drivers at 21 to 26.
  const age = kind === 'prospect' ? 15 + Math.floor(random() * 3) : 21 + Math.floor(random() * 6);
  const month = 1 + Math.floor(random() * 12);
  const day = 1 + Math.floor(random() * 28);
  const two = (value: number): string => (value < 10 ? `0${value}` : String(value));
  const born = `${season - age}-${two(month)}-${two(day)}`;
  // Most are decent; a few are exceptional.
  const potential = kind === 'prospect' ? Math.round(68 + 27 * Math.pow(random(), 1.8)) : Math.round(74 + 10 * random());
  const rate = (spread: number): number => Math.round(clamp(potential + (random() - 0.5) * spread, 50, 98));
  const peak: Ratings = {
    pace: rate(8),
    racecraft: rate(12),
    consistency: rate(12),
    tyres: rate(14),
    wet: rate(16),
    aggression: Math.round(45 + random() * 45),
  };
  const from = 24 + Math.floor(random() * 3);
  const profile: DriverProfile = { peak, prime: [from, from + 4 + Math.floor(random() * 4)] };
  const letters = lastName.replace(/^(de |van |di )/i, '').normalize('NFD').replace(/[^A-Za-z]/g, '');
  const fact: DriverFact = {
    id,
    name: `${firstName} ${lastName}`,
    firstName,
    lastName,
    code: letters.slice(0, 3).toUpperCase(),
    born,
    countryCode: people.code,
    nationality: people.nationality,
    debut: season,
    raced: [season, 2026],
  };
  const driver: FictionalDriver = { fact, profile, potential, retireAge: 33 + Math.floor(random() * 6), kind };
  cache.set(id, driver);
  return driver;
}

/** A short tag for a career, so its made-up drivers differ from every other career's. */
export const careerTag = (careerId: string): string => hash(careerId).toString(36).slice(0, 5);
