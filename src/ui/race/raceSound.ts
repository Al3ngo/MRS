/**
 * What the race sounds like from the pit wall: each car going past on the start-and-finish
 * straight, the rest of the field in the distance, the rain, pit stops and crashes. It only reads
 * the race; it never changes it.
 */
import type { RaceEvent, RaceState } from '../../game/sim';
import { rainAt } from '../../game/sim';
import { ambience, crash, engineEra, launch, passBy, pitStop, type Ambience, type EngineEra } from '../../platform/sound';
import type { RaceClock } from './clock';
import { placeOnTrack, type TrackMap } from './track';

/** How long a car takes to go past, in real seconds, at each speed of the race clock. */
const PASS_LENGTH: Readonly<Record<number, number>> = { 1: 1.1, 2: 0.8, 4: 0.55 };

export class RaceSound {
  private readonly state: RaceState;
  private readonly era: EngineEra;
  private readonly circuit: Ambience;
  /** Which way the cars cross the screen at the line: left to right (1) or right to left (-1). */
  private readonly direction: number;
  /** Each car's lap count at the last frame, to hear it cross the line. */
  private readonly laps: number[];
  private playing = false;

  constructor(state: RaceState, map: TrackMap, clock: RaceClock) {
    this.state = state;
    this.era = engineEra(state.setup.season);
    this.circuit = ambience(this.era);
    const before = placeOnTrack(map, 0.995, { x: 0, y: 0, nx: 0, ny: 0 });
    const after = placeOnTrack(map, 0.005, { x: 0, y: 0, nx: 0, ny: 0 });
    this.direction = after.x >= before.x ? 1 : -1;
    this.laps = state.cars.map((_, index) => Math.floor(clock.shown(index)));
  }

  /** Once a frame: who crossed the line, and the circuit's level. `speed` 0 is paused. */
  frame(clock: RaceClock, speed: number): void {
    const { state } = this;
    this.playing = speed > 0 && state.phase === 'racing';
    const wet = state.wetness;
    let racing = 0;
    for (let index = 0; index < state.cars.length; index++) {
      const car = state.cars[index]!;
      if (car.status === 'running') racing += 1;
      const lap = Math.floor(clock.shown(index));
      if (lap <= this.laps[index]!) continue;
      this.laps[index] = lap;
      if (!this.playing || car.status !== 'running' || lap < 1) continue;
      const mine = state.setup.grid[car.entrant]!.player;
      // At the top speed only the player's cars are heard going past; the rest blur into the circuit.
      if (speed >= 4 && !mine) continue;
      passBy({
        era: this.era,
        level: (mine ? 1 : 0.6) * (state.flag.kind === 'green' ? 1 : 0.55),
        direction: this.direction,
        length: (PASS_LENGTH[speed] ?? 0.8) * (state.flag.kind === 'green' ? 1 : 1.6),
        wet,
        wobble: 0.98 + ((car.entrant * 7) % 9) / 200,
        priority: mine,
      });
    }
    this.circuit.update({
      running: this.playing,
      field: racing / Math.max(1, state.cars.length),
      slow: state.flag.kind !== 'green',
      rain: rainAt(state.rain, state.time + state.stopped),
    });
  }

  /** Something happened in the race. Ignored while paused, or after a skip to the end. */
  event(event: RaceEvent): void {
    if (!this.playing && event.type !== 'start') return;
    const mine = (id: string): boolean => this.state.setup.grid.find((entrant) => entrant.id === id)?.player ?? false;
    switch (event.type) {
      case 'start':
        launch(this.era);
        break;
      case 'pit':
        if (mine(event.car)) pitStop();
        break;
      case 'crash':
        crash(mine(event.car) ? 1 : 0.6);
        break;
      case 'collision':
        crash(mine(event.car) || mine(event.with) ? 1 : 0.6);
        break;
      default:
        break;
    }
  }

  stop(): void {
    this.circuit.stop();
  }
}
