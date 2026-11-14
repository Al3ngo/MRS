/**
 * The race clock: runs the simulation at the speed the player has chosen, and smooths what is
 * shown between its one-second steps.
 */
import { TICK, command, runToEnd, step, type RaceState } from '../../game/sim';

/** 0 is paused. */
export type Speed = 0 | 1 | 2 | 4;
export const SPEEDS: readonly Speed[] = [1, 2, 4];

/**
 * Race seconds that pass in one real second at 1x. A Grand Prix takes an hour and a half; at this
 * pace it takes about nine minutes at 1x and a little over two at 4x.
 */
export const PACE = 10;

export class RaceClock {
  readonly state: RaceState;
  speed: Speed = 0;
  /** Race time owed but not yet simulated, in seconds. */
  private carry = 0;
  /** Where each car was one step ago, and the safety car. */
  private before: number[];
  private safetyCarBefore: number | null = null;

  constructor(state: RaceState) {
    this.state = state;
    this.before = state.cars.map((car) => car.pos);
  }

  /** Lets `realMs` of real time pass. Returns how many steps the race moved on. */
  run(realMs: number): number {
    const { state } = this;
    const over = (): boolean => state.phase === 'finished';
    if (this.speed === 0 || over()) return 0;
    // A stalled tab does not get to catch up all at once.
    this.carry += (Math.min(realMs, 100) / 1000) * PACE * this.speed;
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
