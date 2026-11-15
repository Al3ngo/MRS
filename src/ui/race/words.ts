/**
 * The words of a race: what the driver says on the radio, and the line each event puts in the feed.
 * The simulation deals in codes; the wording is chosen here.
 */
import { driver as driverById } from '../../game/data';
import { formatLap } from '../format';
import type {
  CarOutlook,
  EnergyMode,
  EngineMode,
  Entrant,
  PushLevel,
  RaceEvent,
  RaceState,
  RadioMessage,
  SessionRules,
} from '../../game/sim';

const RADIO: Readonly<Record<RadioMessage, string>> = {
  'tyres-going': 'These tyres are starting to go.',
  'tyres-gone': 'The tyres are finished. I need to pit.',
  'fuel-low': 'Fuel is marginal. We need to save.',
  'battery-empty': 'The battery is empty.',
  damage: 'I have damage. The car is not right.',
  'want-inters': 'It is too wet for dry tyres. Intermediates, please.',
  'want-wets': 'Too much standing water. I need the full wet tyres.',
  'want-slicks': 'The track is dry enough for dry tyres again.',
  'stuck-behind': 'I am stuck behind him. I cannot get by.',
  'engine-worry': 'Something is wrong with the car. I am losing power.',
  'on-the-limit': 'I am right on the limit here. I cannot keep this up.',
};

export const radioWords = (message: RadioMessage): string => RADIO[message];

export const ENGINE_WORDS: Readonly<Record<EngineMode, string>> = { save: 'Save', standard: 'Standard', push: 'Push' };

/** Why a car stopped, or why the race was slowed: a short label for tables and a phrase for sentences. */
const CAUSES: Readonly<Record<string, { short: string; phrase: string }>> = {
  Engine: { short: 'Engine', phrase: 'an engine failure' },
  'Power unit': { short: 'Engine', phrase: 'an engine failure' },
  Gearbox: { short: 'Gearbox', phrase: 'a gearbox failure' },
  Hydraulics: { short: 'Hydraulics', phrase: 'a hydraulics failure' },
  Brakes: { short: 'Brakes', phrase: 'a brake failure' },
  Electrics: { short: 'Electrics', phrase: 'an electrical failure' },
  Suspension: { short: 'Suspension', phrase: 'broken suspension' },
  Exhaust: { short: 'Exhaust', phrase: 'an exhaust failure' },
  KERS: { short: 'KERS boost', phrase: 'a KERS boost failure' },
  Turbo: { short: 'Turbo', phrase: 'a turbo failure' },
  'Energy recovery': { short: 'Hybrid system', phrase: 'a hybrid system failure' },
  Cooling: { short: 'Overheating', phrase: 'overheating' },
  Accident: { short: 'Crash', phrase: 'a crash' },
  Collision: { short: 'Collision', phrase: 'a collision' },
  'Out of fuel': { short: 'Out of fuel', phrase: 'running out of fuel' },
  'Stopped car': { short: 'Stopped car', phrase: 'a car stopped on the track' },
  'Heavy rain': { short: 'Heavy rain', phrase: 'heavy rain' },
};

/** A retirement or a reason, as a short label: "Gearbox", "KERS boost", "Crash". */
export const causeLabel = (cause: string): string => CAUSES[cause]?.short ?? cause;
/** The same, as a phrase for a sentence: "a gearbox failure", "overheating". */
export const causePhrase = (cause: string): string => CAUSES[cause]?.phrase ?? cause.toLowerCase();

const ORDINAL_ENDINGS = ['th', 'st', 'nd', 'rd'];
/** 1st, 2nd, 3rd, 11th, 22nd. */
export const placeWords = (place: number): string =>
  `${place}${place % 100 >= 11 && place % 100 <= 13 ? 'th' : (ORDINAL_ENDINGS[place % 10] ?? 'th')}`;

/** One line on what each setting does, shown under the controls when it is chosen. */
export const PUSH_HELP: Readonly<Record<PushLevel, string>> = {
  conserve: 'Conserve: slower, but saves the tyres and calms the driver.',
  normal: 'Normal: a steady pace. The driver slowly calms down.',
  push: 'Push: faster, but wears the tyres and stresses the driver.',
  'all-out': 'All-out: much faster for a lap or two. Stress climbs fast.',
};

export const ENGINE_HELP: Readonly<Record<EngineMode, string>> = {
  save: 'Engine on save: slower, but uses less fuel and spares the engine.',
  standard: 'Engine on standard: normal power and fuel use.',
  push: 'Engine on push: more power, but more fuel and engine wear.',
};

export function energyHelp(rules: SessionRules, mode: EnergyMode): string {
  if (rules.recovery === 'kers') {
    if (mode === 'harvest') return 'Bank: saves this lap\'s boost for later. A little slower.';
    if (mode === 'overtake') return 'Boost: spends the stored boost to attack or defend.';
    return 'Normal: uses the boost as it comes.';
  }
  if (mode === 'harvest') return 'Harvest: slower, but charges the battery.';
  if (mode === 'attack') return 'Attack: faster, but drains the battery.';
  if (mode === 'overtake') {
    return rules.overtakingAid === 'active-aero'
      ? 'Overtake: a big boost, but only within a second of the car ahead.'
      : 'Overtake: a big boost to pass or defend. Drains the battery fast.';
  }
  return 'Balanced: uses the battery\'s charge as it comes.';
}

export const STRESS_HELP = 'Stress: rises when pushing or defending. A stressed driver makes mistakes.';

export const PUSH_WORDS: Readonly<Record<PushLevel, string>> = {
  conserve: 'Conserve',
  normal: 'Normal',
  push: 'Push',
  'all-out': 'All-out',
};

/** Energy modes by name. With KERS the three settings are the boost button's. */
export function energyWords(rules: SessionRules, mode: EnergyMode): string {
  if (rules.recovery === 'kers') return mode === 'harvest' ? 'Bank' : mode === 'overtake' ? 'Boost' : 'Normal';
  return mode === 'harvest' ? 'Harvest' : mode === 'balanced' ? 'Balanced' : mode === 'attack' ? 'Attack' : 'Overtake';
}

/** How wet the track is, in a word. */
export function trackWords(wetness: number): string {
  if (wetness < 0.02) return 'Dry';
  if (wetness < 0.13) return 'Damp';
  if (wetness < 0.5) return 'Wet';
  return 'Very wet';
}

export interface FeedLine {
  lap: number;
  /** Whose line it is, when it belongs to a car: shown as a tag in the team's colour. */
  who: { code: string; colour: string } | null;
  text: string;
  /** 'radio' is the driver speaking; 'flag' is race control; 'note' is the rest. */
  kind: 'radio' | 'flag' | 'note';
}

/**
 * The feed line for an event, or null if the event is not worth one. The feed follows the
 * player's cars closely and the rest of the field only for what changes the race.
 */
export function feedLine(state: RaceState, event: RaceEvent): FeedLine | null {
  const grid = state.setup.grid;
  const entrant = (id: string): Entrant => grid.find((candidate) => candidate.id === id)!;
  const tag = (id: string): FeedLine['who'] => ({ code: entrant(id).code, colour: entrant(id).colour });
  const last = (id: string): string => driverById(entrant(id).driver).lastName;
  const line = (kind: FeedLine['kind'], text: string, who: string | null = null): FeedLine => ({
    lap: event.lap,
    who: who ? tag(who) : null,
    text,
    kind,
  });

  switch (event.type) {
    case 'start':
      return line('flag', 'Lights out. The race is on.');
    case 'safety-car':
      return line('flag', `Safety car, for ${causePhrase(event.reason)}. No overtaking.`);
    case 'virtual-safety-car':
      return line('flag', `Virtual safety car, for ${causePhrase(event.reason)}. Everyone slows down.`);
    case 'green':
      return line('flag', 'Green flag. Racing again.');
    case 'red-flag':
      return line('flag', event.resumed ? 'Red flag: the race is stopped, and will restart.' : 'Red flag: the race is stopped for good.');
    case 'rain':
      if (event.state === 'coming') return line('note', 'Rain is a few minutes away.');
      return line('note', event.state === 'started' ? 'It has started to rain.' : 'The rain has stopped.');
    case 'radio':
      return line('radio', radioWords(event.message), event.car);
    case 'overtake': {
      const [by, on] = [entrant(event.car), entrant(event.on)];
      if (by.player) return line('note', `Passes ${last(event.on)} for ${placeWords(event.position)}.`, event.car);
      if (on.player) return line('note', `Loses ${placeWords(event.position)} to ${last(event.car)}.`, event.on);
      return event.position === 1 ? line('note', `Takes the lead from ${last(event.on)}.`, event.car) : null;
    }
    case 'pit': {
      if (!entrant(event.car).player) return null;
      const tyre = state.setup.compounds.find((compound) => compound.id === event.compound)!;
      return line('note', `Pit stop: ${tyre.name.toLowerCase()} tyres, ${event.stationary.toFixed(1)} seconds standing still.`, event.car);
    }
    case 'mistake':
      if (!entrant(event.car).player) return null;
      return event.spin ? line('note', `Spins, and loses ${Math.round(event.lost)} seconds.`, event.car) : null;
    case 'puncture':
      return entrant(event.car).player ? line('note', 'Puncture. Coming in to the pits.', event.car) : null;
    case 'crash':
      return line('note', 'Crashes out.', event.car);
    case 'collision': {
      if (event.out.length > 0) {
        const others = event.out.map(last).join(' and ');
        return line('note', `Collision with ${last(event.with)}. ${others} ${event.out.length > 1 ? 'are' : 'is'} out.`, event.car);
      }
      const mine = [event.car, event.with].find((id) => entrant(id).player);
      if (!mine) return null;
      return line('note', `Contact with ${last(mine === event.car ? event.with : event.car)}.`, mine);
    }
    case 'failure':
      return event.out ? line('note', `Retires with ${causePhrase(event.cause)}.`, event.car) : null;
    case 'out-of-fuel':
      return line('note', 'Runs out of fuel.', event.car);
    case 'fastest-lap':
      return line('note', `Fastest lap, ${formatLap(event.lapTime)}.`, event.car);
    case 'finish':
      if (event.position === 1) return line('flag', `${entrant(event.car).driverName} wins.`);
      return entrant(event.car).player ? line('note', `Finishes ${placeWords(event.position)}.`, event.car) : null;
  }
}

/** A term on the race screen and what it means. */
export interface GuideEntry {
  term: string;
  meaning: string;
}

/** Everything the race screen shows, in plain words. Only what the season has is listed. */
export function raceGuide(rules: SessionRules): GuideEntry[] {
  const entries: GuideEntry[] = [
    { term: 'HAM, VET, ALO…', meaning: 'Drivers\' names cut to three letters, as on a real timing screen: HAM is Hamilton.' },
    { term: 'Gap ahead', meaning: 'Seconds behind the car in front. "+1 lap" means the leader has gone a whole lap further.' },
    { term: 'Stops', meaning: 'Pit stops made so far: a stop in the pit lane for new tyres, and repairs if needed.' },
    { term: 'Tyre bar', meaning: 'How much life the tyres have left. Green is fresh, red is worn out and slow.' },
    {
      term: 'Tyre colours',
      meaning:
        'Each tyre type has its own colour. Softer tyres are faster but wear out sooner. Intermediates are for a damp track, wets for heavy rain.',
    },
    { term: 'Two tyre types', meaning: 'In a dry race each car must use at least two different dry tyre types, so at least one stop.' },
    {
      term: 'Fuel bar',
      meaning: 'Fuel left. Green means enough to finish, amber only just, red not enough: put the engine on Save.',
    },
    {
      term: 'Tyre and fuel graph',
      meaning:
        'On each car\'s card: one slim bar per lap from now (left) to the flag (right), showing how much tyre and fuel will be left. A white line is a planned stop. If it turns red before the line or the end, it will not last.',
    },
    {
      term: 'Weather',
      meaning: 'Above the map: the track now, and the next laps\' weather with the chance of rain. Rain ahead means wet tyres soon.',
    },
  ];
  if (rules.recovery === 'kers') {
    entries.push({ term: 'Battery bar', meaning: 'KERS: energy saved when braking, spent as a short boost of extra power.' });
  } else if (rules.recovery === 'ers') {
    entries.push({ term: 'Battery bar', meaning: 'Electric energy for extra power. Harvest to charge it, Attack or Overtake to spend it.' });
  }
  entries.push(
    { term: 'Stress bar', meaning: 'How tense the driver is. Green is calm; red means mistakes and crashes are far likelier.' },
    { term: 'Track bar', meaning: 'How wet the track is: empty when dry, filling and turning red as it floods.' },
  );
  if (rules.overtakingAid === 'drs') {
    entries.push({
      term: 'DRS',
      meaning: 'A flap in the rear wing that opens on the straights for a car within a second of the one ahead, to help it overtake.',
    });
  } else if (rules.overtakingAid === 'active-aero') {
    entries.push({ term: 'Active aero', meaning: 'The wings flatten by themselves on the straights. There is no DRS.' });
  }
  entries.push({ term: 'Safety car', meaning: 'A car leads the field slowly while a crash is cleared. No overtaking.' });
  if (rules.virtualSafetyCar) {
    entries.push({ term: 'Virtual safety car', meaning: 'Everyone slows to a set speed without a car to follow. No overtaking.' });
  }
  entries.push(
    { term: 'Red flag', meaning: 'The race is stopped, usually for a big crash or heavy rain. It may be restarted.' },
    { term: 'Chequered flag', meaning: 'The end of the race: each car finishes as it next crosses the line.' },
  );
  return entries;
}

/** What a car's tyre and fuel graph says, in a few words: for its label and the warning under it. */
export function outlookWords(outlook: CarOutlook): { tyres: string; fuel: string; warning: string | null } {
  const laps = (count: number): string => `${count} ${count === 1 ? 'lap' : 'laps'}`;
  const tyres =
    outlook.tyresShortBy !== null
      ? `Tyres worn out ${laps(outlook.tyresShortBy)} before ${outlook.stopIn !== null ? 'the stop' : 'the flag'}`
      : outlook.stopIn !== null
        ? `Tyres last to the stop in ${laps(outlook.stopIn)}`
        : 'Tyres last to the flag';
  const fuel = outlook.fuelShortBy !== null ? `Fuel runs out ${laps(outlook.fuelShortBy)} early` : 'Fuel lasts to the flag';
  let warning: string | null = null;
  if (outlook.tyresShortBy !== null && outlook.fuelShortBy !== null) warning = 'Tyres and fuel won\'t last';
  else if (outlook.tyresShortBy !== null) warning = `Tyres gone ${laps(outlook.tyresShortBy)} early`;
  else if (outlook.fuelShortBy !== null) warning = `Fuel ${laps(outlook.fuelShortBy)} short`;
  return { tyres, fuel, warning };
}
