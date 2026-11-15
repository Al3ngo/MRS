/**
 * The pit wall: planning a race before it starts, and the calls made as it unfolds.
 *
 * The simulation uses this for every car it runs. The player's cars follow the plan they were
 * given and nothing more, unless they are handed over (CarState.auto).
 */
import * as M from './model';
import { clamp, pickWeighted, wholeBetween, type Luck } from './rng';
import { compound, compoundOfKind, dryCompounds } from './tyres';
import { styleOf } from './styles';
import { rainAt, rainDueIn } from './weather';
import type {
  CarState,
  Compound,
  EnergyMode,
  EngineMode,
  Entrant,
  PlannedStop,
  PushLevel,
  RaceState,
  SessionSetup,
} from './types';

/** A race is flagged at the end of the lap on which two hours have passed. */
export const TIME_LIMIT = 7200;

/** One way of getting to the finish. */
export interface Option {
  /** Seconds lost to tyres and stops: lower is better. */
  cost: number;
  /** The tyre to be on first. */
  first: string;
  /** The stops after that; `after` counts laps from now. */
  stops: { after: number; compound: string }[];
}

interface Ask {
  /** The tyres on the car, to carry on with. Null to start on a fresh set of anything. */
  current: { compound: Compound; wear: number } | null;
  used: readonly string[];
  /** Whether two different dry compounds must be used. */
  ruleApplies: boolean;
  maxStops: number;
  /** Seconds a stop costs. */
  stopCost: number;
}

/** Pace lost over a stint, as lap-shares summed over its laps. */
function stintLoss(tyre: Compound, care: number, startWear: number, laps: number, fuel: number, fuelPerLap: number): number {
  let wear = startWear;
  let loss = 0;
  for (let i = 0; i < laps; i++) {
    const rate = (care * (1 + M.FUEL_WEAR * Math.max(0, fuel))) / tyre.life;
    loss += tyre.pace + M.wearLoss(wear + rate / 2, tyre.fade);
    wear += rate;
    fuel -= fuelPerLap;
  }
  return loss;
}

/**
 * Every sensible way of covering `lapsLeft` laps on dry tyres, best first. Stints are sized to
 * each tyre's life, which is where the best split lies when tyres fall away faster as they age.
 */
export function options(setup: SessionSetup, entrant: Entrant, lapsLeft: number, ask: Ask): Option[] {
  const dry = dryCompounds(setup);
  const care = M.tyreCare(entrant.ratings.tyres);
  const usedDry = ask.used.filter((id) => dry.some((tyre) => tyre.id === id));
  const fuelPerLap = 1 / setup.fullDistanceLaps;
  const out: Option[] = [];
  if (lapsLeft <= 0) return out;

  const sequence: Compound[] = [];
  const consider = (): void => {
    const stints = sequence.length;
    if (stints > lapsLeft) return;
    if (ask.ruleApplies) {
      const seen = new Set(usedDry);
      for (const tyre of sequence) seen.add(tyre.id);
      if (seen.size < 2) return;
    }
    const weights = sequence.map((tyre, i) =>
      i === 0 && ask.current ? tyre.life * Math.max(0.04, 1 - ask.current.wear) : tyre.life,
    );
    let total = 0;
    for (const weight of weights) total += weight;
    const lengths = weights.map((weight) => Math.max(1, Math.round((lapsLeft * weight) / total)));
    // Rounding may leave a lap over or short: the longest stint takes it.
    let sum = 0;
    let longest = 0;
    lengths.forEach((length, i) => {
      sum += length;
      if (length > lengths[longest]!) longest = i;
    });
    lengths[longest]! += lapsLeft - sum;
    if (lengths[longest]! < 1) return;

    let cost = (stints - 1) * ask.stopCost;
    let done = 0;
    const stops: Option['stops'] = [];
    sequence.forEach((tyre, i) => {
      const wear = i === 0 && ask.current ? ask.current.wear : 0;
      const fuel = (lapsLeft - done) * fuelPerLap;
      cost += stintLoss(tyre, care, wear, lengths[i]!, fuel, fuelPerLap) * setup.refLap;
      done += lengths[i]!;
      if (i < stints - 1) stops.push({ after: done, compound: sequence[i + 1]!.id });
    });
    out.push({ cost, first: sequence[0]!.id, stops });
  };
  const extend = (): void => {
    consider();
    if (sequence.length > ask.maxStops) return;
    for (const tyre of dry) {
      sequence.push(tyre);
      extend();
      sequence.pop();
    }
  };
  for (const tyre of ask.current ? [ask.current.compound] : dry) {
    sequence.push(tyre);
    extend();
    sequence.pop();
  }
  return out.sort((a, b) => a.cost - b.cost);
}

/** What a stop costs at this circuit, in seconds, for planning. */
const stopCost = (setup: SessionSetup): number => setup.traits.pitLoss + 1;

/**
 * A plan for the whole race on a dry track: the tyres to start on and the stops to make. Teams do
 * not all read a race the same way, so the choice is made among the plans close to the best.
 */
export function planRace(setup: SessionSetup, entrant: Entrant, luck: Luck): { start: string; stops: PlannedStop[] } {
  const all = options(setup, entrant, setup.laps, {
    current: null,
    used: [],
    ruleApplies: setup.rules.twoCompoundRule,
    maxStops: setup.kind === 'sprint' ? 0 : 3,
    stopCost: stopCost(setup),
  });
  const best = all[0];
  if (!best) return { start: dryCompounds(setup)[0]!.id, stops: [] };
  const near = all.filter((option) => option.cost <= best.cost + 4).slice(0, 4);
  const chosen = near[pickWeighted(luck, near.map((_, i) => 1 / (1 + i * 1.2)))]!;

  const stops: PlannedStop[] = [];
  let earliest = 1;
  for (const stop of chosen.stops) {
    const lap = clamp(stop.after + wholeBetween(luck, -1, 1), earliest, setup.laps - 1);
    stops.push({ lap, compound: stop.compound });
    earliest = lap + 1;
  }
  return { start: chosen.first, stops: stops.filter((stop) => stop.lap < setup.laps) };
}

/** Laps this car still has to run after the one it is on. */
export function lapsToGo(state: RaceState, car: CarState): number {
  const { setup } = state;
  const lap = Math.max(1, Math.floor(car.pos) + 1);
  const byDistance = setup.laps - lap - car.lapsDown;
  const pace = setup.refLap * (state.flag.kind === 'green' ? 1.07 : 1.45);
  const byTime = Math.floor((TIME_LIMIT - state.time) / pace);
  return Math.max(0, Math.min(byDistance, byTime));
}

/** Whether this car still has to use a second dry compound. Using a wet-weather tyre lifts the rule. */
export function ruleApplies(state: RaceState, car: CarState): boolean {
  const { setup } = state;
  if (!setup.rules.twoCompoundRule) return false;
  return car.usedCompounds.every((id) => compound(setup, id).kind === 'dry');
}

const KINDS: readonly M.TyreKind[] = ['dry', 'inter', 'wet'];

/** The kind of tyre the next few minutes call for, and how much quicker it is than what is fitted. */
export function tyreCall(state: RaceState, fitted: M.TyreKind): { kind: M.TyreKind; gain: number } {
  const rain = rainAt(state.rain, state.time + state.stopped + 60);
  const soon = clamp(state.wetness + (rain > state.wetness ? (rain - state.wetness) * 0.4 : -0.06), 0, 1);
  const loss = (kind: M.TyreKind): number => (M.gripLoss(kind, state.wetness) + M.gripLoss(kind, soon)) / 2;
  let best = fitted;
  for (const kind of KINDS) if (loss(kind) < loss(best)) best = kind;
  return { kind: best, gain: loss(fitted) - loss(best) };
}

/**
 * The tyres to fit if the car stops now. With `replan`, the car's remaining stops are rewritten to
 * suit; without, only the choice of tyre is returned.
 */
export function freshTyres(state: RaceState, car: CarState, replan: boolean): { compound: string } {
  const { setup } = state;
  const kind = tyreCall(state, compound(setup, car.tyre).kind).kind;
  if (kind !== 'dry') {
    if (replan) car.plan = [];
    return { compound: compoundOfKind(setup, kind).id };
  }
  const lap = Math.max(1, Math.floor(car.pos) + 1);
  const left = Math.max(1, lapsToGo(state, car));
  const best = options(setup, setup.grid[car.entrant]!, left, {
    current: null,
    used: car.usedCompounds,
    ruleApplies: ruleApplies(state, car),
    maxStops: 2,
    stopCost: stopCost(setup),
  })[0];
  if (!best) return { compound: dryCompounds(setup)[0]!.id };
  if (replan) car.plan = best.stops.map((stop) => ({ lap: lap + stop.after, compound: stop.compound }));
  return { compound: best.first };
}

/** Share of a stop's usual cost when the field is running slowly. */
export const SAFETY_CAR_STOP = 0.55;
export const VIRTUAL_STOP = 0.65;

/**
 * The call for the end of this lap: the tyres to stop for, or null to stay out. Made once a lap,
 * late enough to see the lap and early enough to reach the pit entry.
 */
export function pitDecision(state: RaceState, car: CarState): { compound: string } | null {
  const { setup } = state;
  const entrant = setup.grid[car.entrant]!;
  const lap = Math.max(1, Math.floor(car.pos) + 1);
  const left = lapsToGo(state, car);
  const next = car.plan[0];

  // The player's cars do as planned, and no more.
  if (!car.auto) return next && lap >= next.lap && left >= 1 ? { compound: next.compound } : null;
  if (left < 1) return null;

  // The weather comes first.
  const fitted = compound(setup, car.tyre);
  const call = tyreCall(state, fitted.kind);
  const style = styleOf(entrant);
  // A strategist (the player's team has one) reads the weather sooner the better they are.
  const read = entrant.strategist === undefined ? 0 : (0.5 - entrant.strategist) * 0.012;
  const nerve = 0.022 + 0.018 * (((car.entrant * 7 + 3) % 10) / 10) + style.rainNerve + read;
  if (call.kind !== fitted.kind && call.gain > nerve) return freshTyres(state, car, true);
  if (fitted.kind !== 'dry') return car.wear > 1.1 && left >= 3 ? { compound: fitted.id } : null;

  const cost = stopCost(setup);
  const ask = { used: car.usedCompounds, ruleApplies: ruleApplies(state, car), maxStops: 2, stopCost: cost };
  const carryOn = (): Option | undefined =>
    options(setup, entrant, left, { ...ask, current: { compound: fitted, wear: car.wear } })[0];
  const adopt = (option: Option): void => {
    car.plan = option.stops.map((stop) => ({ lap: lap + stop.after, compound: stop.compound }));
  };

  // Damage worth a new nose.
  if (car.damage * left * setup.refLap > cost * 0.8 + 4) return freshTyres(state, car, true);

  // A cheap stop while the field is slowed.
  if (state.flag.kind !== 'green') {
    const share = state.flag.kind === 'safety-car' ? SAFETY_CAR_STOP : VIRTUAL_STOP;
    const stay = carryOn();
    const stop = options(setup, entrant, left, { ...ask, current: null })[0];
    const margin = style.cheapStopMargin - (entrant.strategist === undefined ? 0 : (entrant.strategist - 0.5) * 2);
    if (stop && (!stay || stop.cost + cost * share + margin < stay.cost)) {
      adopt(stop);
      return { compound: stop.first };
    }
    return null;
  }

  if (next && lap >= next.lap) {
    // With rain minutes away, a stop for slicks can wait while the tyres hold.
    const rainSoon = rainDueIn(state.rain, state.time + state.stopped, 300) !== null;
    if (!(rainSoon && car.wear < 1.25)) return { compound: next.compound };
  }

  // Tyres finished well before the plan said they would be.
  if (car.wear > style.changeWornAt && left >= 2 && !(next && next.lap - lap <= 2)) return freshTyres(state, car, true);

  // No stop planned: check the tyres will last and the rule is met; if not, plan again.
  if (!next) {
    const rate = M.tyreCare(entrant.ratings.tyres) / fitted.life;
    const short = ask.ruleApplies && new Set(car.usedCompounds).size < 2;
    if (short || car.wear + left * rate > style.stretchTo) {
      const stay = carryOn();
      if (!stay) return freshTyres(state, car, true);
      adopt(stay);
    }
  }
  return null;
}

/** Engine and energy modes for a car the simulation is running. */
export function driveModes(state: RaceState, car: CarState): void {
  const { rules } = state.setup;
  const entrant = state.setup.grid[car.entrant]!;
  const green = state.flag.kind === 'green';
  // Fuel is kept for the whole distance, even by a car that expects to be lapped: races change.
  const toRun = state.setup.laps - car.pos;
  const spare = car.fuel - toRun;
  const attacking = car.gapAhead < 1.4;
  const defending = car.gapBehind < 1.1;
  const style = styleOf(entrant);

  let engine: EngineMode = 'standard';
  if (green) {
    if (spare < 0.05 || (car.engineMode === 'save' && spare < 0.2)) engine = 'save';
    else if (
      entrant.engineAge <= style.enginePushAge &&
      ((spare > style.enginePushSpareClose && (attacking || defending)) || spare > style.enginePushSpare)
    )
      engine = 'push';
  }
  car.engineMode = engine;
  car.push = pushLevel(state, car, attacking, defending);

  if (rules.recovery === 'none') return;
  let energy: EnergyMode = 'balanced';
  const charge = car.battery;
  const clear = !attacking && !defending;
  if (!green) {
    energy = 'balanced';
  } else if (rules.recovery === 'kers') {
    const using = car.energyMode === 'overtake' && charge > 4;
    if (state.lap === 0 && charge > 4) energy = 'overtake';
    else if ((car.gapAhead < 0.9 || defending) && (charge >= style.kersCharge || using)) energy = 'overtake';
    else if (clear && charge < 60) energy = 'harvest';
  } else {
    if (car.gapAhead < M.AID_RANGE && charge > style.overtakeCharge) energy = 'overtake';
    else if (defending && charge > style.defendCharge) energy = 'attack';
    else if (clear && (charge < style.harvestBelow || (car.energyMode === 'harvest' && charge < 60))) energy = 'harvest';
    else if (charge > 85) energy = 'attack';
  }
  car.energyMode = energy;
}

/**
 * How hard a car the simulation runs is told to go. Normal nearly all the time, as a real pit wall
 * would have it. Push only after a long while stuck behind a car; all-out only for a pass in the
 * last laps; conserve to shed stress, or to make worn tyres reach the planned stop.
 */
function pushLevel(state: RaceState, car: CarState, _attacking: boolean, _defending: boolean): PushLevel {
  if (state.flag.kind !== 'green') return 'normal';
  const style = styleOf(state.setup.grid[car.entrant]!);
  if (car.stress > style.conserveAbove || (car.push === 'conserve' && car.stress > 25)) return 'conserve';
  const next = car.plan[0];
  const lap = Math.max(1, Math.floor(car.pos) + 1);
  if (car.wear > style.nurseTyresAt && next && next.lap - lap > 3) return 'conserve';
  const lap0 = state.setup.refLap;
  if (car.gapAhead < style.allOutGap && lapsToGo(state, car) <= style.allOutLaps && car.stress < style.allOutStress) {
    return 'all-out';
  }
  if (car.held > style.pushAfterLaps * lap0 && car.stress < style.pushStress) return 'push';
  if (car.push === 'push' && car.gapAhead < 1 && car.stress < style.keepPushStress) return 'push';
  return 'normal';
}
