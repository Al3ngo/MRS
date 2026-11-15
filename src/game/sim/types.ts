/**
 * The simulation's vocabulary.
 *
 * A session is set up once (SessionSetup: who, what car, where, under which rules) and then lives
 * in a state object (RaceState) that is stepped forward in time. Both are plain JSON: a race can be
 * saved mid-lap and resumed, and the same seed always gives the same race.
 */
import type { Ratings } from '../data/ratings';

/** How hard the engine is run: speed against fuel and reliability. */
export type EngineMode = 'save' | 'standard' | 'push';
/** What the car does with its electrical energy. Which modes exist depends on the season. */
export type EnergyMode = 'harvest' | 'balanced' | 'attack' | 'overtake';
/** How hard the driver is told to go: pace against tyres and stress. */
export type PushLevel = 'conserve' | 'normal' | 'push' | 'all-out';
/** How a team's pit wall runs its cars. See styles.ts. */
export type TeamStyle = 'aggressive' | 'balanced' | 'cautious';

/** A car's qualities, 0 to 100. Development (Stage 6) moves these; here they are inputs. */
export interface CarSpec {
  aero: number;
  chassis: number;
  /** The whole power unit as fitted: engine, and from 2014 the hybrid system. */
  power: number;
  reliability: number;
  /** Pit crew speed and sureness. */
  pitCrew: number;
}

export interface Compound {
  id: string;
  name: string;
  colour: string;
  kind: 'dry' | 'inter' | 'wet';
  /** Lap time it costs against the softest dry tyre of the weekend, as a fraction of a lap. */
  pace: number;
  /** Laps it lasts at this circuit before it falls away, for an average driver. */
  life: number;
  /** Lap time it has lost by the end of that life, as a fraction of a lap. */
  fade: number;
}

export interface PlannedStop {
  /** Stop at the end of this lap. */
  lap: number;
  compound: string;
}

export interface Entrant {
  /** Unique in the session: "ferrari-1". */
  id: string;
  team: string;
  teamName: string;
  colour: string;
  driver: string;
  driverName: string;
  code: string;
  ratings: Ratings;
  car: CarSpec;
  /** How well the car is set up for this circuit, 0 (lost) to 1 (perfect). */
  setup: number;
  /** How worn the power unit is at the start, 0 (new) to 1 (at the end of its life). */
  engineAge: number;
  /** Run by the player: modes change only on command. Otherwise the simulation drives the pit wall. */
  player: boolean;
  /** How the team's pit wall runs the car when the simulation makes its calls. Missing means balanced. */
  style?: TeamStyle;
}

export interface SessionRules {
  season: number;
  recovery: 'none' | 'kers' | 'ers';
  /** Electrical share of the power unit: 1 for 2014 to 2025, larger from 2026. */
  energyScale: number;
  overtakingAid: 'none' | 'drs' | 'active-aero';
  virtualSafetyCar: boolean;
  /** How much following another car costs, relative to the 2010 cars. */
  dirtyAir: number;
  /** Two different dry compounds must be used in a dry race. */
  twoCompoundRule: boolean;
  /** Lap time a full tank costs, as a share of a lap. */
  fuelEffect: number;
}

export interface SessionSetup {
  kind: 'race' | 'sprint';
  season: number;
  round: number;
  /** The last round of the season: matters for the points in 2014. */
  finale: boolean;
  name: string;
  circuit: string;
  laps: number;
  /** Laps of the full Grand Prix here: a full tank is fuel for this many. */
  fullDistanceLaps: number;
  lapKm: number;
  /** Quickest dry lap of the weekend, seconds. */
  refLap: number;
  traits: {
    power: number;
    downforce: number;
    tyreWear: number;
    overtaking: number;
    safetyCar: number;
    rain: number;
    pitLoss: number;
    danger: number;
  };
  rules: SessionRules;
  /** Dry compounds softest first, then intermediate and wet. */
  compounds: readonly Compound[];
  /** Entrants in grid order: pole first. */
  grid: readonly Entrant[];
  /** Overrides the weather the seed would give. For tests and for "what if" races. */
  weather?: readonly RainSpell[];
}

/** A period of rain. `from` and `to` are seconds of race time; `intensity` runs 0 to 1. */
export interface RainSpell {
  from: number;
  to: number;
  intensity: number;
}

export type CarStatus = 'running' | 'pit' | 'out' | 'finished';

export interface CarState {
  id: string;
  /** Index into setup.grid. */
  entrant: number;
  status: CarStatus;
  /** Distance covered, in laps. Starts just below zero on the grid. */
  pos: number;
  /** Laps completed. */
  lap: number;
  /** Race position, 1-based, among all starters. */
  position: number;
  /** Seconds to the car ahead in the race, 0 for the leader. */
  interval: number;
  /** Seconds to the leader (ignoring whole laps). */
  gap: number;
  /** Whole laps behind the leader. */
  lapsDown: number;
  /** Seconds to the next car on the road, whatever lap it is on; 99 when the road is clear. */
  gapAhead: number;
  /** Seconds back to the car following on the road; 99 when nobody is near. */
  gapBehind: number;
  /** Laps per second right now: lets a screen draw the car between two steps. */
  rate: number;
  /** The overtaking aid is open. */
  aidOpen: boolean;
  /** Seconds spent stuck right behind the same car. */
  held: number;
  /** The simulation runs this car's pit wall. Off for the player's cars until asked. */
  auto: boolean;

  lapStartedAt: number;
  lastLap: number | null;
  bestLap: number | null;
  /** This lap was not run at racing speed throughout, so it sets no records. */
  lapCautioned: boolean;
  /** This lap's share of driver inconsistency, as a fraction of a lap. */
  noise: number;
  /** The driver's day: a little quicker or slower than his rating all race, as a fraction of a lap. */
  form: number;
  /** Seconds still to be lost to a slow moment: a start, a mistake, letting someone by. */
  owed: number;

  tyre: string;
  /** 0 new, 1 at the end of its life, beyond that it is falling apart. */
  wear: number;
  tyreLaps: number;
  usedCompounds: string[];
  stops: number;

  /** Fuel on board, in laps at standard burn. */
  fuel: number;
  engineMode: EngineMode;
  energyMode: EnergyMode;
  push: PushLevel;
  /** How stressed the driver is, 0 to 100. Builds when pushing or defending, eases when not. */
  stress: number;
  /** Battery charge, 0 to 100. */
  battery: number;
  /** Pace lost to damage, as a fraction of a lap. Repaired at a stop. */
  damage: number;
  /** Pace lost to a mechanical problem that cannot be fixed in the race. */
  fault: number;
  /** Power-unit wear picked up this session, in race distances at standard mode. */
  engineWear: number;

  plan: PlannedStop[];
  /** A stop called for the end of this lap. */
  pitCall: { compound: string } | null;
  /** The car has to stop (a puncture): the call cannot be cancelled. */
  forcedStop: boolean;
  pitTimeLeft: number;
  /** Length of the stop in progress, pit lane included. */
  pitDuration: number;
  /** Lap on which the pit wall last made up its mind, so it decides once a lap. */
  decidedOnLap: number;
  /** No attack on the car ahead before this time: the breath after a move. */
  noAttackBefore: number;
  /** Race time until which the tyres are still warming up. */
  coldUntil: number;
  /** Lap on which each radio message was last sent, so the driver does not repeat himself. */
  told: Record<string, number>;

  finishTime: number | null;
  /** Why the car is out, in words fit for a timing screen. */
  retiredWith: string | null;
  /** Seconds added at the flag for breaking the tyre rule. */
  penalty: number;
}

export type Flag =
  | { kind: 'green' }
  | { kind: 'safety-car'; pos: number; lapsLeft: number; reason: string }
  | { kind: 'virtual-safety-car'; until: number; reason: string };

export type RaceEvent = { time: number; lap: number } & (
  | { type: 'start' }
  /** `error`: the car passed was in trouble at the time, rather than beaten in a fight. */
  | { type: 'overtake'; car: string; on: string; position: number; error: boolean }
  | { type: 'pit'; car: string; compound: string; stationary: number }
  | { type: 'fastest-lap'; car: string; lapTime: number }
  | { type: 'mistake'; car: string; lost: number; spin: boolean }
  | { type: 'crash'; car: string; severity: number }
  | { type: 'collision'; car: string; with: string; out: string[]; severity: number }
  | { type: 'failure'; car: string; cause: string; out: boolean }
  | { type: 'puncture'; car: string }
  | { type: 'safety-car'; reason: string }
  | { type: 'virtual-safety-car'; reason: string }
  | { type: 'green' }
  | { type: 'red-flag'; resumed: boolean; reason: string }
  | { type: 'rain'; state: 'coming' | 'started' | 'stopped' }
  | { type: 'radio'; car: string; message: RadioMessage }
  | { type: 'out-of-fuel'; car: string }
  | { type: 'finish'; car: string; position: number }
);

/** What a driver or engineer tells the pit wall. The words are chosen by the screen that shows them. */
export type RadioMessage =
  | 'tyres-going'
  | 'tyres-gone'
  | 'fuel-low'
  | 'battery-empty'
  | 'damage'
  | 'want-inters'
  | 'want-wets'
  | 'want-slicks'
  | 'stuck-behind'
  | 'engine-worry'
  | 'on-the-limit';

export interface RaceState {
  setup: SessionSetup;
  /** State of the random number generator: the whole of the race's luck. */
  rng: number;
  /** Seconds of racing since the lights went out. */
  time: number;
  /** Seconds the race has stood stopped under a red flag. The weather carries on meanwhile. */
  stopped: number;
  phase: 'grid' | 'racing' | 'finished';
  /** Laps the leader has completed. */
  lap: number;
  flag: Flag;
  /** Rain spells of this race, fixed at the start. */
  rain: RainSpell[];
  /** How wet the track is, 0 dry to 1 flooded. */
  wetness: number;
  /** Whether the track has been wet enough for wet-weather tyres at any point. */
  declaredWet: boolean;
  /** Lap (of the leader) from which the overtaking aid is allowed again. */
  aidFromLap: number;
  /** Until the leader has completed this lap the field is bunched: a start or a restart. */
  bunchedUntilLap: number;
  /** The leader has taken the flag; the rest finish as they reach the line. */
  chequered: boolean;
  chequeredAt: number | null;
  redFlags: number;
  /** The flag fell before the full distance: time ran out, or the race was stopped for good. */
  endedEarly: boolean;
  /** Stopped by a red flag and never restarted. Matters for the points of a short race. */
  abandoned: boolean;
  fastestLap: { car: string; lapTime: number; lap: number } | null;
  /** A red flag called during a step, shown once the step is complete; the reason. */
  redFlagDue: string | null;
  cars: CarState[];
  events: RaceEvent[];
}

export type Command =
  | { type: 'engine-mode'; car: string; mode: EngineMode }
  | { type: 'energy-mode'; car: string; mode: EnergyMode }
  | { type: 'push'; car: string; level: PushLevel }
  | { type: 'pit'; car: string; compound: string }
  | { type: 'cancel-pit'; car: string }
  /** Sets the stops to make. `start` picks the tyres to start on, and only counts on the grid. */
  | { type: 'plan'; car: string; stops: PlannedStop[]; start?: string }
  /** Hands a car's pit wall to the simulation, or takes it back. */
  | { type: 'auto'; car: string; on: boolean };

export interface ResultRow {
  position: number;
  car: string;
  driver: string;
  team: string;
  laps: number;
  /** Race time for those on the lead lap at the flag; null otherwise. */
  time: number | null;
  /** 'Finished', '+1 lap', the reason for retiring, or 'Disqualified'. */
  status: string;
  classified: boolean;
  points: number;
  grid: number;
  stops: number;
  bestLap: number | null;
  fastestLap: boolean;
  /** Power-unit wear picked up, in race distances, for the season's parts allowance. */
  engineWear: number;
}
