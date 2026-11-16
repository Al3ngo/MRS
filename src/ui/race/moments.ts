/**
 * The moments of a race worth slowing down for: an overtake by or on one of the player's cars, any
 * crash, collision or retirement, and the safety car or a red flag. Each slows the race (or holds
 * it still for a moment) and shows a short message over the map.
 */
import type { RaceEvent, RaceState } from '../../game/sim';
import type { FeedLine } from './words';

export type MomentKind = 'overtake' | 'crash' | 'retired' | 'caution';

export interface Moment {
  kind: MomentKind;
  /** One or two words for the message: "Overtake", "Safety car". */
  title: string;
  /** The message itself: the race feed's line for the event. */
  line: FeedLine;
  /** The share of the chosen speed while it plays: 0 holds the race still. */
  rate: number;
  /** How long it plays, in real seconds. */
  seconds: number;
  /** The cars it is about, ringed on the map. */
  cars: string[];
}

/** Slow motion: a quarter of the chosen speed, so 1x plays at a quarter, 4x at 1x. */
const SLOW = 0.25;

export function momentOf(state: RaceState, event: RaceEvent, line: FeedLine | null): Moment | null {
  if (!line) return null;
  const mine = (id: string): boolean => state.setup.grid.find((entrant) => entrant.id === id)?.player ?? false;
  const moment = (kind: MomentKind, title: string, cars: string[], held: boolean, seconds: number): Moment => ({
    kind,
    title,
    line,
    rate: held ? 0 : SLOW,
    seconds,
    cars,
  });
  switch (event.type) {
    case 'overtake':
      if (!mine(event.car) && !mine(event.on)) return null;
      return moment('overtake', mine(event.car) ? 'Overtake' : 'Place lost', [event.car, event.on], false, 2.2);
    case 'crash':
      return moment('crash', 'Crash', [event.car], mine(event.car), mine(event.car) ? 1.8 : 2.4);
    case 'collision': {
      const ours = mine(event.car) || mine(event.with);
      return moment('crash', 'Collision', [event.car, event.with], ours, ours ? 1.8 : 2.4);
    }
    case 'failure':
      if (!event.out) return null;
      return moment('retired', 'Retired', [event.car], mine(event.car), mine(event.car) ? 1.8 : 2);
    case 'out-of-fuel':
      return moment('retired', 'Out of fuel', [event.car], mine(event.car), 2);
    case 'safety-car':
      return moment('caution', 'Safety car', [], true, 2);
    case 'virtual-safety-car':
      return moment('caution', 'Virtual safety car', [], true, 2);
    case 'red-flag':
      return event.resumed ? null : moment('caution', 'Red flag', [], true, 2.2);
    default:
      return null;
  }
}

/** Two moments at once (a crash that brings out the safety car): the stronger hold, the newer message. */
export function together(playing: { moment: Moment; until: number } | null, next: Moment, now: number): { moment: Moment; until: number } {
  const until = now + next.seconds * 1000;
  if (!playing || playing.until <= now) return { moment: next, until };
  return {
    moment: { ...next, rate: Math.min(playing.moment.rate, next.rate), cars: [...new Set([...next.cars, ...playing.moment.cars])] },
    until: Math.max(playing.until, until),
  };
}
