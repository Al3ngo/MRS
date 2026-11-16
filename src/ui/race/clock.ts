/**
 * The race clock: runs the simulation at the speed the player has chosen, and smooths what is
 * shown between its one-second steps.
 */
import { RACE_TRIM, TICK, command, runToEnd, step, type RaceState } from '../../game/sim';

/** 0 is paused. */
export type Speed = 0 | 1 | 2 | 4;
export const SPEEDS: readonly Speed[] = [1, 2, 4];

/** Seconds a lap takes on screen at 1x, at every circuit. */
export const LAP_ON_SCREEN = 15;

/**
 * Race seconds that pass in one real second at 1x: a typical racing lap of this circuit in
 * LAP_ON_SCREEN seconds. A Grand Prix takes about a quarter of an hour at 1x, and four minutes at 4x.
 */
export const paceOf = (state: RaceState): number => (state.setup.refLap * (1 + RACE_TRIM + 0.03)) / LAP_ON_SCREEN;

/**
 * The race clock. The simulation moves in steps of TICK race seconds; the screen shows the race
 * running smoothly at the chosen pace, each car drawn part way between its last two steps, so how
 * often the simulation steps never shows.
 */
export class RaceClock {
  readonly state: RaceState;
  /** Race seconds per real second at 1x. */
  readonly pace: number;
  speed: Speed = 0;
  /** A moment worth watching slows the clock: a share of the chosen speed, 0 to hold it still. */
  slow = 1;
  /** Race time owed but not yet simulated, in seconds. */
  private carry = 0;
  /** Where each car was one step ago, and the safety car. */
  private before: number[];
  private safetyCarBefore: number | null = null;

  constructor(state: RaceState) {
    this.state = state;
    this.pace = paceOf(state);
    this.before = state.cars.map((car) => car.pos);
  }

  /** Lets `realMs` of real time pass. Returns how many steps the race moved on. */
  run(realMs: number): number {
    const { state } = this;
    const over = (): boolean => state.phase === 'finished';
    if (this.speed === 0 || this.slow <= 0 || over()) return 0;
    // A stalled tab does not get to catch up all at once.
    this.carry += (Math.min(realMs, 100) / 1000) * this.pace * this.speed * this.slow;
    let steps = 0;
    while (this.carry >= TICK && !over()) {
      this.remember();
      step(state);
      this.carry -= TICK;
      steps += 1;
    }
    return steps;
  }

  private remember(): void {
    const { state } = this;
    for (let i = 0; i < state.cars.length; i++) this.before[i] = state.cars[i]!.pos;
    this.safetyCarBefore = state.flag.kind === 'safety-car' ? state.flag.pos : null;
  }

  /** A car's position to draw: part way between its last two steps. */
  shown(index: number): number {
    const { state } = this;
    // On the grid, in two-by-two order behind the line.
    if (state.phase === 'grid') return -(index + 1) * 0.0032;
    const now = state.cars[index]!.pos;
    const was = this.before[index]!;
    // A car put somewhere else (a restart) is not slid there.
    if (Math.abs(now - was) > 0.04) return now;
    return was + (now - was) * Math.min(1, this.carry / TICK);
  }

  safetyCar(): number | null {
    const { flag } = this.state;
    if (flag.kind !== 'safety-car') return null;
    const was = this.safetyCarBefore;
    if (was === null || Math.abs(flag.pos - was) > 0.04) return flag.pos;
    return was + (flag.pos - was) * Math.min(1, this.carry / TICK);
  }

  /** Hands every car to the pit wall and runs the race out. */
  skip(): void {
    const { state } = this;
    for (const car of state.cars) command(state, { type: 'auto', car: car.id, on: true });
    this.remember();
    runToEnd(state);
    this.carry = 0;
  }
}
