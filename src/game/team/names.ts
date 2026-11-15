/**
 * Invented names for the people and companies the game makes up: team staff and sponsors. The
 * brief asks for real teams and real drivers; everyone and everything else is fictional, as in
 * Golden Lap, so no real engineer or brand is put to work in a game.
 */
import { pick, type Luck } from '../sim/rng';

const PEOPLE: Readonly<Record<string, { first: readonly string[]; last: readonly string[] }>> = {
  British: {
    first: ['Alistair', 'Fiona', 'Gareth', 'Harriet', 'Callum', 'Imogen', 'Rupert', 'Tamsin', 'Duncan', 'Eleanor'],
    last: ['Ashcombe', 'Pennick', 'Marlow', 'Dunmore', 'Hollis', 'Garside', 'Ellery', 'Thwaite', 'Bramley', 'Crossan'],
  },
  Italian: {
    first: ['Matteo', 'Giulia', 'Lorenzo', 'Chiara', 'Davide', 'Francesca', 'Stefano', 'Alessia'],
    last: ['Ferrandi', 'Castellaro', 'Monteleone', 'Brunetti', 'Valsecchi', 'Orlandini', 'Pazzaglia', 'Ricciuti'],
  },
  German: {
    first: ['Jonas', 'Katrin', 'Matthias', 'Leonie', 'Florian', 'Sabine', 'Tobias', 'Anja'],
    last: ['Brandauer', 'Kessling', 'Wohlrab', 'Hentschel', 'Dornbach', 'Steinhoff', 'Ruppert', 'Falkner'],
  },
  French: {
    first: ['Antoine', 'Camille', 'Julien', 'Margaux', 'Olivier', 'Sandrine', 'Thibault', 'Elise'],
    last: ['Laforgue', 'Delmotte', 'Vasseur-Roy', 'Charmant', 'Bellanger', 'Rouvière', 'Montaland', 'Grosjacques'],
  },
  Spanish: {
    first: ['Javier', 'Lucía', 'Andrés', 'Marta', 'Iñigo', 'Carmen'],
    last: ['Ezcurra', 'Valdemoro', 'Arrieta', 'Olmedilla', 'Sanlúcar', 'Belmonte-Ruiz'],
  },
  Japanese: {
    first: ['Kenji', 'Aiko', 'Hiroshi', 'Yuki', 'Takumi', 'Naomi'],
    last: ['Tachibana', 'Morikawa', 'Hasegawa', 'Ichinose', 'Kurosaki', 'Shimazu'],
  },
  Brazilian: {
    first: ['Rafael', 'Beatriz', 'Thiago', 'Larissa', 'Gustavo', 'Renata'],
    last: ['Albuquerque', 'Teixeira Lobo', 'Vasconcelos', 'Brandão', 'Quintela', 'Medeiros'],
  },
  American: {
    first: ['Bryce', 'Courtney', 'Wesley', 'Shannon', 'Garrett', 'Molly'],
    last: ['Halvorsen', 'Whitcombe', 'Pryor', 'Kendrick', 'Ashby', 'Lindqvist'],
  },
  Dutch: {
    first: ['Joost', 'Femke', 'Ruben', 'Lotte', 'Bram', 'Sanne'],
    last: ['van Oosterhout', 'Dekkers', 'Hoogland', 'Bakelaar', 'van Wijlen', 'Smeulders'],
  },
  Australian: {
    first: ['Lachlan', 'Kirra', 'Hamish', 'Brooke', 'Angus', 'Tegan'],
    last: ['McCallister', 'Riordan', 'Fairweather', 'Goodwin-Hart', 'Strachan', 'Baird'],
  },
};

export const NATIONALITIES: readonly string[] = Object.keys(PEOPLE);

/** A made-up person: a nationality, and a name that fits it. */
export function personName(luck: Luck): { name: string; nationality: string } {
  const nationality = pick(luck, NATIONALITIES);
  const names = PEOPLE[nationality]!;
  return { name: `${pick(luck, names.first)} ${pick(luck, names.last)}`, nationality };
}

const SPONSOR_ROOTS = [
  'Varnholt', 'Quillon', 'Teskari', 'Brannoch', 'Solvane', 'Ardentis', 'Corvel', 'Halvery', 'Lumivo', 'Ostrand',
  'Pellucid', 'Marrowind', 'Kestrova', 'Zephrane', 'Altamund', 'Brisola', 'Cindral', 'Dovetail', 'Elmscott', 'Fennimore',
  'Glaston', 'Hartvale', 'Ingersol', 'Jorvane', 'Korriva', 'Larkspire', 'Montague Lane', 'Norvessa', 'Orrin', 'Pacquet',
];

const SPONSOR_TRADES = [
  'Energy', 'Watches', 'Telecom', 'Bank', 'Logistics', 'Airways', 'Software', 'Insurance', 'Drinks', 'Freight',
  'Paints', 'Coffee', 'Electronics', 'Cloud', 'Lubricants', 'Eyewear', 'Hotels', 'Capital',
];

/** A made-up company to put on the car. */
export function sponsorName(luck: Luck): string {
  return `${pick(luck, SPONSOR_ROOTS)} ${pick(luck, SPONSOR_TRADES)}`;
}
