/**
 * The words of a race: what the driver says on the radio, and the line each event puts in the feed.
 * The simulation deals in codes; the wording is chosen here.
 */
import { formatLap } from '../format';
import type { EnergyMode, EngineMode, Entrant, PushLevel, RaceEvent, RaceState, RadioMessage, SessionRules } from '../../game/sim';

const RADIO: Readonly<Record<RadioMessage, string>> = {
  'tyres-going': 'These tyres are starting to go.',
  'tyres-gone': 'The tyres are finished. I need to box.',
  'fuel-low': 'Fuel is marginal. We need to save.',
  'battery-empty': 'The battery is empty.',
  damage: 'I have damage. The car is not right.',
  'want-inters': 'It is too wet for slicks. Inters, please.',
  'want-wets': 'Too much standing water. I need the full wets.',
  'want-slicks': 'The track is dry enough for slicks.',
  'stuck-behind': 'I am stuck behind him. I cannot get by.',
  'engine-worry': 'Something is wrong with the car. I am losing power.',
  'on-the-limit': 'I am right on the limit here. I cannot keep this up.',
};

export const radioWords = (message: RadioMessage): string => RADIO[message];

export const ENGINE_WORDS: Readonly<Record<EngineMode, string>> = { save: 'Save', standard: 'Standard', push: 'Push' };

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

const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The feed line for an event, or null if the event is not worth one. The feed follows the
 * player's cars closely and the rest of the field only for what changes the race.
 */
export function feedLine(state: RaceState, event: RaceEvent): FeedLine | null {
  const grid = state.setup.grid;
  const entrant = (id: string): Entrant => grid.find((candidate) => candidate.id === id)!;
  const tag = (id: string): FeedLine['who'] => ({ code: entrant(id).code, colour: entrant(id).colour });
  const line = (kind: FeedLine['kind'], text: string, who: string | null = null): FeedLine => ({
    lap: event.lap,
    who: who ? tag(who) : null,
    text,
    kind,
  });

  switch (event.type) {
    case 'start':
      return line('flag', 'Lights out.');
    case 'safety-car':
      return line('flag', `Safety car. ${sentence(event.reason)}.`);
    case 'virtual-safety-car':
      return line('flag', `Virtual safety car. ${sentence(event.reason)}.`);
    case 'green':
      return line('flag', 'Green flag. Racing again.');
    case 'red-flag':
      return line('flag', event.resumed ? 'Red flag. The race will be restarted.' : 'Red flag. The race is over.');
    case 'rain':
      if (event.state === 'coming') return line('note', 'Rain is a few minutes away.');
      return line('note', event.state === 'started' ? 'It has started to rain.' : 'The rain has stopped.');
    case 'radio':
      return line('radio', radioWords(event.message), event.car);
    case 'overtake': {
      const [by, on] = [entrant(event.car), entrant(event.on)];
      if (by.player) return line('note', `Passes ${on.driverName.split(' ').at(-1)} for P${event.position}.`, event.car);
      if (on.player) return line('note', `Loses P${event.position} to ${by.driverName.split(' ').at(-1)}.`, event.on);
      return event.position === 1 ? line('note', `Takes the lead from ${on.code}.`, event.car) : null;
    }
    case 'pit': {
      if (!entrant(event.car).player) return null;
      const tyre = state.setup.compounds.find((compound) => compound.id === event.compound)!;
      return line('note', `Pit stop: ${tyre.name.toLowerCase()} tyres, ${event.stationary.toFixed(1)} seconds.`, event.car);
    }
    case 'mistake':
      if (!entrant(event.car).player) return null;
      return event.spin ? line('note', `Spins, and loses ${Math.round(event.lost)} seconds.`, event.car) : null;
    case 'puncture':
      return entrant(event.car).player ? line('note', 'Puncture. Coming in.', event.car) : null;
    case 'crash':
      return line('note', 'Crashes out.', event.car);
    case 'collision': {
      if (event.out.length > 0) {
        const others = event.out.map((id) => entrant(id).code).join(' and ');
        return line('note', `Collision with ${entrant(event.with).code}. ${others} out.`, event.car);
      }
      const mine = [event.car, event.with].find((id) => entrant(id).player);
      if (!mine) return null;
      return line('note', `Contact with ${entrant(mine === event.car ? event.with : event.car).code}.`, mine);
    }
    case 'failure':
      return event.out ? line('note', `Retires: ${event.cause.toLowerCase()}.`, event.car) : null;
    case 'out-of-fuel':
      return line('note', 'Runs out of fuel.', event.car);
    case 'fastest-lap':
      return line('note', `Fastest lap, ${formatLap(event.lapTime)}.`, event.car);
    case 'finish':
      if (event.position === 1) return line('flag', `${entrant(event.car).driverName} wins.`);
      return entrant(event.car).player ? line('note', `Finishes P${event.position}.`, event.car) : null;
  }
}
