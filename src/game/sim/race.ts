/**
 * The race.
 *
 * A race is a state object stepped forward one second at a time. Each car has a position measured
 * in laps; every step it moves by what its lap time allows, unless the car ahead on the road is in
 * the way, in which case it has to find a way past. Around that sit the things that make a race:
 * tyres wearing, fuel burning off, pit stops, rain, mistakes, failures, safety cars.
 *
 * step() changes the state it is given. The state is plain data: copy it, save it, load it, and
 * the race carries on exactly as it would have.
 */
import { fastestLapPointOffered, racePointsTable, rulesFor } from '../data/regulations';
import * as M from './model';
import { between, chance, clamp, gaussian, pick, random, wholeBetween } from './rng';
import {
  SAFETY_CAR_STOP,
  TIME_LIMIT,
  VIRTUAL_STOP,
  driveModes,
  freshTyres,
  lapsToGo,
  pitDecision,
  planRace,
  ruleApplies,
  tyreCall,
} from './strategy';
import { compoundOfKind } from './tyres';
import { makeWeather, rainAt, rainDueIn, settle, wetnessAtStart } from './weather';
import type {
  CarState,
  Command,
  Compound,
  Entrant,
  PlannedStop,
  RaceEvent,
  RaceState,
  RadioMessage,
  ResultRow,
  SessionSetup,
} from './types';

/** Seconds of racing in one step. */
export const TICK = 1;

/** As close as one car sits behind another, in seconds. */
const MIN_GAP = 0.22;
/** Close enough to try a pass, or to touch. */
const CONTACT = 0.5;
/** Share of the lap the pit lane runs alongside. */
const PIT_LANE = 0.035;
/** Lap times behind the safety car, catching its queue, and under the virtual one, against the reference lap. */
const SAFETY_CAR_PACE = 1.5;
const CATCH_UP_PACE = 1.25;
const VIRTUAL_PACE = 1.4;
/** Seconds between grid slots as the cars reach the first corner. */
const GRID_SLOT = 0.28;
/** The first seconds of a standing start run at half speed. */
const GETAWAY = 8;

/** Chance per lap of a small mistake, for a steady driver on a dry track. */
const MISTAKE = 0.008;
/** How a circuit's safety cars divide between accidents and breakdowns. */
const HEAVY_SHARE = 0.62;
const LIGHT_SHARE = 0.46;
/** Share of mistakes that end in the barriers at an ordinary circuit. */
const CRASH = 0.045;
/** Chance per lap of contact between two cars running nose to tail. */
const TOUCH = 0.012;
/** How much a driver's day varies: the spread of his form, as a share of a lap. */
const FORM = 0.0013;
/** How much likelier that is in a bunched field: a start or a restart. */
const BUNCHED = 5;
/** Chance per lap of a puncture from debris. */
const PUNCTURE = 0.00035;
/** Share of mechanical problems the car can carry to the finish. */
const LIMP_HOME = 0.27;
/**
 * A race works an engine a little harder than the standard mode on a new unit that reliability
 * is measured by: some pushing, some age. This brings the two back into line.
 */
const USUAL_STRAIN = 1.3;

const frac = (value: number): number => value - Math.floor(value);

// ── Facts worked out once per session ───────────────────────────────────────────────────────

interface Facts {
  deficit: number[];
  compounds: Map<string, Compound>;
  /** A typical racing lap, for turning distances into seconds. */
  nominal: number;
  /** Cars expected to stop with a mechanical failure over the distance. */
  breakdowns: number;
}

const factsBySetup = new WeakMap<SessionSetup, Facts>();

function facts(setup: SessionSetup): Facts {
  let found = factsBySetup.get(setup);
  if (!found) {
    found = {
      // Race pace: the car, and how it runs on race day against how it qualified (racePace).
      deficit: setup.grid.map((entrant) => M.carDeficit(entrant.car, setup.traits) + (entrant.racePace ?? 0)),
      compounds: new Map(setup.compounds.map((tyre) => [tyre.id, tyre])),
      nominal: setup.refLap * (1 + M.RACE_TRIM + 0.03),
      breakdowns:
        setup.grid.reduce((sum, entrant) => sum + M.failureChance(entrant.car.reliability), 0) *
        (setup.laps / setup.fullDistanceLaps),
    };
    factsBySetup.set(setup, found);
  }
  return found;
}

type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function note(state: RaceState, event: Without<RaceEvent, 'time' | 'lap'>): void {
  state.events.push({ time: state.time, lap: Math.min(state.setup.laps, state.lap + 1), ...event } as RaceEvent);
}

function tell(state: RaceState, car: CarState, message: RadioMessage, every: number): void {
  if (!state.setup.grid[car.entrant]!.player) return;
  const lap = Math.floor(car.pos);
  const last = car.told[message];
  if (last !== undefined && lap - last < every) return;
  car.told[message] = lap;
  note(state, { type: 'radio', car: car.id, message });
}

// ── Setting up ──────────────────────────────────────────────────────────────────────────────

/** Fuel at the start: the distance at standard mode, and a little over. */
export const startFuel = (setup: SessionSetup): number => setup.laps * 1.012 + 0.3;

function newCar(state: RaceState, entrant: Entrant, index: number): CarState {
  const { setup } = state;
  const kind = M.idealKind(state.wetness);
  let tyre: string;
  let plan: PlannedStop[] = [];
  if (kind === 'dry') {
    const chosen = planRace(setup, entrant, state);
    tyre = chosen.start;
    plan = chosen.stops;
  } else {
    tyre = compoundOfKind(setup, kind).id;
  }
  return {
    id: entrant.id,
    entrant: index,
    status: 'running',
    pos: 0,
    lap: 0,
    position: index + 1,
    interval: 0,
    gap: 0,
    lapsDown: 0,
    gapAhead: 99,
    gapBehind: 99,
    rate: 0,
    aidOpen: false,
    held: 0,
    auto: !entrant.player,
    lapStartedAt: 0,
    lastLap: null,
    bestLap: null,
    lapCautioned: false,
    noise: 0,
    form: gaussian(state) * FORM,
    owed: 0,
    tyre,
    wear: 0,
    tyreLaps: 0,
    usedCompounds: [tyre],
    stops: 0,
    fuel: startFuel(setup),
    engineMode: 'standard',
    energyMode: 'balanced',
    push: 'normal',
    stress: 0,
    battery: setup.rules.recovery === 'kers' ? 100 : setup.rules.recovery === 'ers' ? 60 : 0,
    damage: 0,
    fault: 0,
    engineWear: 0,
    plan,
    pitCall: null,
    forcedStop: false,
    pitTimeLeft: 0,
    pitDuration: 0,
    decidedOnLap: -1,
    noAttackBefore: 0,
    coldUntil: 0,
    told: {},
    finishTime: null,
    retiredWith: null,
    penalty: 0,
  };
}

/** A race ready on the grid. The seed decides its weather and all its luck. */
export function createRace(setup: SessionSetup, seed: number): RaceState {
  const state: RaceState = {
    setup,
    rng: seed | 0,
    time: 0,
    stopped: 0,
    phase: 'grid',
    lap: 0,
    flag: { kind: 'green' },
    rain: [],
    wetness: 0,
    declaredWet: false,
    aidFromLap: 2,
    bunchedUntilLap: 1,
    chequered: false,
    chequeredAt: null,
    redFlags: 0,
    endedEarly: false,
    abandoned: false,
    fastestLap: null,
    redFlagDue: null,
    cars: [],
    events: [],
  };
  const length = setup.laps * setup.refLap * 1.08;
  state.rain = setup.weather
    ? setup.weather.map((spell) => ({ ...spell }))
    : makeWeather(state, setup.traits.rain, length);
  state.wetness = wetnessAtStart(state.rain);
  state.declaredWet = state.wetness > M.DRY_LIMIT;
  state.cars = setup.grid.map((entrant, index) => newCar(state, entrant, index));
  return state;
}

/** Gives an order from the pit wall. Returns false if it could not be carried out. */
export function command(state: RaceState, order: Command): boolean {
  const { setup } = state;
  const car = state.cars.find((candidate) => candidate.id === order.car);
  if (!car || car.status === 'out' || car.status === 'finished' || state.phase === 'finished') return false;
  const known = (id: string): boolean => setup.compounds.some((tyre) => tyre.id === id);
  switch (order.type) {
    case 'engine-mode':
      car.engineMode = order.mode;
      return true;
    case 'push':
      if (!M.PUSH_LEVELS.includes(order.level)) return false;
      car.push = order.level;
      return true;
    case 'energy-mode':
      if (!M.energyModes(setup.rules.recovery).includes(order.mode)) return false;
      if (car.battery <= 0 && M.energyEffect(setup.rules, order.mode, true).charge < 0) return false;
      car.energyMode = order.mode;
      return true;
    case 'pit':
      if (!known(order.compound)) return false;
      car.pitCall = { compound: order.compound };
      return true;
    case 'cancel-pit':
      if (car.forcedStop) return false;
      car.pitCall = null;
      return true;
    case 'plan': {
      if (!order.stops.every((stop) => known(stop.compound) && stop.lap >= 1 && stop.lap < setup.laps)) return false;
      if (order.start !== undefined) {
        if (state.phase !== 'grid' || !known(order.start)) return false;
        car.tyre = order.start;
        car.usedCompounds = [order.start];
      }
      car.plan = order.stops.map((stop) => ({ ...stop })).sort((a, b) => a.lap - b.lap);
      return true;
    }
    case 'auto':
      car.auto = order.on;
      return true;
  }
}

// ── The start ───────────────────────────────────────────────────────────────────────────────

/** Lights out: getaways shuffle the order before the first corner. */
function launch(state: RaceState): void {
  const { setup } = state;
  const { nominal } = facts(setup);
  const order = state.cars
    .map((car, slot) => {
      const ratings = setup.grid[car.entrant]!.ratings;
      let getaway = gaussian(state) * 0.26 * (1 + state.wetness) - (ratings.racecraft - 82) * 0.01;
      if (chance(state, 0.03)) getaway += between(state, 0.8, 2.4);
      return { car, at: slot * GRID_SLOT + getaway };
    })
    .sort((a, b) => a.at - b.at);
  order.forEach(({ car }, place) => {
    car.pos = -((place + 1) * 0.3) / nominal;
    car.position = place + 1;
  });
  state.phase = 'racing';
  note(state, { type: 'start' });
}

// ── Pace ────────────────────────────────────────────────────────────────────────────────────

/** How far off the reference lap a car is with a clear road, as a share of a lap. */
function freePace(state: RaceState, car: CarState): number {
  const { setup } = state;
  const entrant = setup.grid[car.entrant]!;
  const known = facts(setup);
  const tyre = known.compounds.get(car.tyre)!;
  const wet = state.wetness;
  let pace =
    M.RACE_TRIM +
    known.deficit[car.entrant]! * (1 - 0.25 * wet) +
    (1 - entrant.setup) * M.SETUP_COST +
    (100 - entrant.ratings.pace) * M.DRIVER_POINT +
    setup.rules.fuelEffect * (car.fuel / setup.fullDistanceLaps) +
    tyre.pace +
    M.wearLoss(car.wear, tyre.fade) +
    M.gripLoss(tyre.kind, wet) * (wet > 0.02 ? M.wetSkill(entrant.ratings.wet) : 1) +
    M.ENGINE[car.engineMode].pace +
    M.PUSH[car.push].pace +
    M.stressPace(car.stress) +
    car.damage +
    car.fault +
    car.noise +
    car.form;
  if (car.battery > 0 || M.energyEffect(setup.rules, car.energyMode, true).charge >= 0) {
    pace += M.energyEffect(setup.rules, car.energyMode, car.gapAhead < M.AID_RANGE).pace;
  }
  if (state.time < car.coldUntil) pace += M.COLD_TYRES;
  return pace;
}

// ── Flags ───────────────────────────────────────────────────────────────────────────────────

function activeCars(state: RaceState): CarState[] {
  return state.cars.filter((car) => car.status === 'running' || car.status === 'pit');
}

function leaderOf(state: RaceState): CarState | null {
  let leader: CarState | null = null;
  for (const car of state.cars) {
    if (car.status !== 'running' && car.status !== 'pit') continue;
    if (!leader || car.pos > leader.pos) leader = car;
  }
  return leader;
}

function safetyCar(state: RaceState, reason: string, laps: number): void {
  const leader = leaderOf(state);
  if (!leader || state.chequered) return;
  if (state.flag.kind === 'safety-car') {
    state.flag.lapsLeft = Math.min(6, Math.max(state.flag.lapsLeft, 2) + 1);
    return;
  }
  state.flag = { kind: 'safety-car', pos: leader.pos + 0.012, lapsLeft: laps, reason };
  note(state, { type: 'safety-car', reason });
}

/**
 * Race control's answer to an incident. A heavy one (a car in the barriers) is likelier to bring
 * out the safety car than a light one (a car stopped at the side), which may need only the virtual
 * one, or nothing. How readily depends on the circuit: there is nowhere to park a car at Singapore.
 *
 * The odds are set so that a circuit sees a safety car about as often as its character says,
 * whether the cars of the day break down a lot or hardly at all.
 */
function neutralise(state: RaceState, severity: 'light' | 'heavy', reason: string): void {
  if (state.chequered || state.phase !== 'racing') return;
  const { rules, traits } = state.setup;
  const expected = -Math.log(1 - Math.min(0.97, traits.safetyCar));
  const full =
    severity === 'heavy'
      ? clamp(HEAVY_SHARE * expected, 0.08, 0.92)
      : clamp((LIGHT_SHARE * expected) / Math.max(1, facts(state.setup).breakdowns), 0.02, 0.5);
  const virtual = rules.virtualSafetyCar ? (severity === 'heavy' ? 0.4 : 0.15) : 0;
  const roll = random(state);
  if (roll < full) {
    safetyCar(state, reason, wholeBetween(state, 3, 5));
  } else if (roll < full + (1 - full) * virtual) {
    if (state.flag.kind === 'safety-car') return;
    const until = state.time + between(state, 70, 170);
    if (state.flag.kind === 'virtual-safety-car') {
      state.flag.until = Math.max(state.flag.until, until);
    } else {
      state.flag = { kind: 'virtual-safety-car', until, reason };
      note(state, { type: 'virtual-safety-car', reason });
    }
  }
}

function goGreen(state: RaceState, restart: boolean): void {
  state.flag = { kind: 'green' };
  if (restart) {
    state.aidFromLap = state.lap + 2;
    state.bunchedUntilLap = state.lap + 1;
  }
  note(state, { type: 'green' });
}

/** The race is stopped. It either restarts behind the safety car after a wait, or is over. */
function redFlag(state: RaceState, reason: string, forRain: boolean): void {
  const { setup } = state;
  const leader = leaderOf(state);
  if (!leader || state.chequered) return;
  state.redFlags += 1;

  let wait = between(state, 900, 2100);
  if (forRain) {
    // Wait for the rain to ease, then a little longer for the standing water.
    let clock = state.time + state.stopped;
    const limit = clock + 3 * 3600;
    while (clock < limit && rainAt(state.rain, clock) > 0.45) clock += 60;
    wait = Math.max(wait, clock - (state.time + state.stopped) + 600);
  }
  const longest = setup.season >= 2021 ? 3600 : 7200;
  const resume = leader.pos < setup.laps * 0.9 && wait <= longest && state.time < TIME_LIMIT - 600;
  note(state, { type: 'red-flag', resumed: resume, reason });

  if (!resume) {
    state.abandoned = true;
    state.endedEarly = true;
    state.chequered = true;
    state.chequeredAt = state.time;
    for (const car of activeCars(state)) {
      car.status = 'finished';
      car.finishTime = car.lapStartedAt;
    }
    return;
  }

  // The weather carries on while the cars wait.
  for (let waited = 0; waited < wait; waited += 30) {
    state.wetness = settle(state.wetness, rainAt(state.rain, state.time + state.stopped + waited), 30);
  }
  state.stopped += wait;

  // The field forms up in race order behind the leader. Repairs and fresh tyres are free.
  const { nominal } = facts(setup);
  const order = activeCars(state).sort((a, b) => b.pos - a.pos);
  const front = leader.pos;
  order.forEach((car, place) => {
    const lapsDown = Math.floor(front - car.pos + 1e-9);
    car.pos = front - lapsDown - (place * 0.6) / nominal;
    car.lap = Math.max(0, Math.floor(car.pos));
    car.lapsDown = lapsDown;
    car.status = 'running';
    car.pitTimeLeft = 0;
    car.pitCall = null;
    car.forcedStop = false;
    car.owed = 0;
    car.damage = 0;
    car.lapCautioned = true;
    const fresh = freshTyres(state, car, car.auto);
    car.tyre = fresh.compound;
    car.wear = 0;
    car.tyreLaps = 0;
    if (!car.usedCompounds.includes(fresh.compound)) car.usedCompounds.push(fresh.compound);
    delete car.told['tyres-going'];
    delete car.told['tyres-gone'];
  });
  state.flag = { kind: 'safety-car', pos: front + 0.01, lapsLeft: 1, reason };
}

function weather(state: RaceState): void {
  const clock = state.time + state.stopped;
  const rain = rainAt(state.rain, clock);
  const before = rainAt(state.rain, clock - TICK);
  if (rain > 0 && before === 0) note(state, { type: 'rain', state: 'started' });
  if (rain === 0 && before > 0) note(state, { type: 'rain', state: 'stopped' });
  if (rainDueIn(state.rain, clock, 240) !== null && rainDueIn(state.rain, clock - TICK, 240) === null) {
    note(state, { type: 'rain', state: 'coming' });
  }
  state.wetness = settle(state.wetness, rain, TICK);
  if (state.wetness > M.DRY_LIMIT) state.declaredWet = true;

  // Too wet to race.
  if (state.wetness > 0.93) redFlag(state, 'Heavy rain', true);
  else if (state.wetness > 0.8 && state.flag.kind !== 'safety-car') safetyCar(state, 'Heavy rain', 3);
}

// ── Trouble ─────────────────────────────────────────────────────────────────────────────────

function retire(car: CarState, cause: string): void {
  car.status = 'out';
  car.retiredWith = cause;
  car.pitCall = null;
  car.forcedStop = false;
  car.rate = 0;
  car.aidOpen = false;
}

function puncture(state: RaceState, car: CarState): void {
  if (car.forcedStop || car.status !== 'running') return;
  const { nominal } = facts(state.setup);
  // A slow drive back: the further from the pits, the more it costs.
  car.owed += (1 - frac(car.pos)) * nominal * 0.3 + 3;
  car.damage += 0.001;
  car.pitCall = freshTyres(state, car, car.auto);
  car.forcedStop = true;
  note(state, { type: 'puncture', car: car.id });
}

function collide(state: RaceState, attacker: CarState, defender: CarState): void {
  const roll = random(state);
  const either = (): [CarState, CarState] => (chance(state, 0.5) ? [attacker, defender] : [defender, attacker]);
  if (roll < 0.55) {
    // A touch: a moment lost, perhaps a damaged wing.
    const [victim] = either();
    victim.owed += between(state, 1, 3.5);
    if (chance(state, 0.45)) {
      attacker.damage += between(state, 0.002, 0.007);
      tell(state, attacker, 'damage', 1);
    }
    note(state, { type: 'collision', car: attacker.id, with: defender.id, out: [], severity: 0.1 });
  } else if (roll < 0.8) {
    // One of them needs the pits.
    const [victim, other] = either();
    puncture(state, victim);
    other.damage += between(state, 0.001, 0.005);
    other.owed += between(state, 0.5, 2);
    tell(state, other, 'damage', 1);
    note(state, { type: 'collision', car: attacker.id, with: defender.id, out: [], severity: 0.3 });
  } else {
    const [first, second] = either();
    const out = [first];
    if (chance(state, 0.4)) out.push(second);
    else {
      second.damage += between(state, 0.003, 0.012);
      second.owed += between(state, 2, 5);
      tell(state, second, 'damage', 1);
    }
    for (const car of out) retire(car, 'Collision');
    const severity = clamp(between(state, 0.3, 0.8) * (state.setup.traits.danger / 3), 0, 1);
    note(state, { type: 'collision', car: attacker.id, with: defender.id, out: out.map((car) => car.id), severity });
    neutralise(state, 'heavy', 'Collision');
  }
}

function mistake(state: RaceState, car: CarState): void {
  const { traits } = state.setup;
  const entrant = state.setup.grid[car.entrant]!;
  const roll = random(state);
  const crash =
    CRASH *
    (traits.danger / 3) *
    (entrant.ratings.aggression / 70) *
    (1 + state.wetness) *
    (1 + 1.5 * M.stressShare(car.stress));
  if (roll < crash) {
    const severity = clamp(between(state, 0.1, 0.7) * (traits.danger / 3) + (chance(state, 0.1) ? 0.3 : 0), 0, 1);
    retire(car, 'Accident');
    note(state, { type: 'crash', car: car.id, severity });
    // A red flag re-forms the whole field, so it waits until every car has moved this step.
    if (severity > 0.75 && chance(state, 0.5)) state.redFlagDue = 'Accident';
    else neutralise(state, 'heavy', 'Accident');
  } else if (roll < crash + 0.1) {
    const lost = between(state, 5, 14);
    car.owed += lost;
    car.wear += 0.04;
    note(state, { type: 'mistake', car: car.id, lost, spin: true });
  } else {
    const lost = between(state, 0.4, 2.6);
    car.owed += lost;
    if (lost > 1.6 || entrant.player) note(state, { type: 'mistake', car: car.id, lost, spin: false });
  }
}

const V8_FAILURES = ['Engine', 'Engine', 'Gearbox', 'Gearbox', 'Hydraulics', 'Brakes', 'Electrics', 'Suspension', 'Exhaust'];
const HYBRID_FAILURES = [
  'Power unit',
  'Power unit',
  'Gearbox',
  'Hydraulics',
  'Brakes',
  'Electrics',
  'Suspension',
  'Turbo',
  'Energy recovery',
  'Cooling',
];

function failure(state: RaceState, car: CarState): void {
  const { rules } = state.setup;
  const causes = rules.recovery === 'ers' ? HYBRID_FAILURES : rules.recovery === 'kers' ? [...V8_FAILURES, 'KERS'] : V8_FAILURES;
  const cause = pick(state, causes);
  if (chance(state, LIMP_HOME)) {
    car.fault += between(state, 0.004, 0.02);
    note(state, { type: 'failure', car: car.id, cause, out: false });
    tell(state, car, 'engine-worry', 1);
    return;
  }
  retire(car, cause);
  note(state, { type: 'failure', car: car.id, cause, out: true });
  neutralise(state, 'light', cause);
}

function hazards(state: RaceState, car: CarState, travelled: number): void {
  const { setup } = state;
  const entrant = setup.grid[car.entrant]!;
  const ratings = entrant.ratings;
  const tyre = facts(setup).compounds.get(car.tyre)!;
  const green = state.flag.kind === 'green';
  const wet = state.wetness;

  let slip = MISTAKE * (1 + (88 - ratings.consistency) / 22) * (1 + 2.5 * wet * M.wetSkill(ratings.wet));
  if (car.engineMode === 'push') slip *= 1.15;
  // Driving harder makes mistakes likelier straight away; the stress it builds adds more over time.
  slip *= M.PUSH[car.push].mistakes * M.stressMistakes(car.stress);
  if (car.wear > 0.95) slip *= 1.4;
  if (M.gripLoss(tyre.kind, wet) > 0.09) slip *= 2;
  if (state.lap < state.bunchedUntilLap) slip *= 1.4;
  if (!green) slip *= 0.08;
  if (chance(state, slip * travelled)) {
    mistake(state, car);
    if (car.status !== 'running') return;
  }

  const age = entrant.engineAge;
  const strain = Math.pow(M.ENGINE[car.engineMode].wear, 0.8) * (1 + 2.2 * age * age) * (green ? 1 : 0.5);
  const breaks =
    (M.failureChance(entrant.car.reliability) / (1 - LIMP_HOME) / setup.fullDistanceLaps / USUAL_STRAIN) * strain;
  if (chance(state, breaks * travelled)) {
    failure(state, car);
    if (car.status !== 'running') return;
  }

  const flat = PUNCTURE + (car.wear > M.BLOWOUT_WEAR ? (car.wear - M.BLOWOUT_WEAR) * 0.5 : 0);
  if (chance(state, flat * travelled)) puncture(state, car);
}

// ── Moving the cars ─────────────────────────────────────────────────────────────────────────

interface Mover {
  /** Null for the safety car. */
  car: CarState | null;
  /** Position before this step, and after it. */
  at: number;
  to: number;
  phys: number;
  free: number;
  closeness: number;
  done: boolean;
}

function overtaken(state: RaceState, by: CarState, on: CarState, error: boolean): void {
  note(state, { type: 'overtake', car: by.id, on: on.id, position: Math.min(by.position, on.position), error });
}

function move(state: RaceState): Mover[] {
  const { setup } = state;
  const { rules, traits, refLap, grid } = setup;
  const flag = state.flag;
  const green = flag.kind === 'green';
  const bunched = state.lap < state.bunchedUntilLap;
  const aidAllowed =
    green && rules.overtakingAid === 'drs' && state.lap >= state.aidFromLap && state.wetness < M.DRY_LIMIT;
  const aidShare = 0.55 + 0.15 * traits.overtaking;

  const ring: Mover[] = [];
  for (const car of state.cars) {
    if (car.status !== 'running') continue;
    car.gapBehind = 99;
    ring.push({ car, at: car.pos, to: car.pos, phys: frac(car.pos), free: freePace(state, car), closeness: 0, done: false });
  }
  if (flag.kind === 'safety-car') {
    const to = flag.pos + TICK / (refLap * SAFETY_CAR_PACE * (1 + 0.1 * state.wetness));
    ring.push({ car: null, at: flag.pos, to, phys: frac(flag.pos), free: 0, closeness: 0, done: true });
    flag.pos = to;
  }
  const count = ring.length;
  if (count === 0) return ring;
  ring.sort((a, b) => a.phys - b.phys);

  // Work back from whoever has the clearest road, so each car knows where the one ahead has got to.
  let first = 0;
  let widest = -1;
  for (let i = 0; i < count; i++) {
    const gap = count === 1 ? 1 : frac(ring[(i + 1) % count]!.phys - ring[i]!.phys);
    if (gap > widest) {
      widest = gap;
      first = i;
    }
  }

  for (let k = 0; k < count; k++) {
    const i = (first - k + count) % count;
    const mover = ring[i]!;
    const car = mover.car;
    if (!car) continue;
    if (car.status !== 'running') {
      mover.done = true;
      continue;
    }
    const ahead = count > 1 ? ring[(i + 1) % count]! : null;
    const own = refLap * (1 + mover.free);
    const gap = ahead ? frac(ahead.at - mover.at) * own : 99;
    car.gapAhead = Math.min(99, gap);
    if (ahead?.car) ahead.car.gapBehind = Math.min(99, gap);

    // Pace on the road: the wake of the car ahead, and the open wing that makes up for it.
    let pace = mover.free;
    const aid = aidAllowed && !!ahead?.car && gap < M.AID_RANGE;
    if (green && ahead?.car) {
      mover.closeness = clamp((1.7 - gap) / 1.2, 0, 1);
      pace += M.dirtyAir(rules, traits.downforce) * mover.closeness;
    }
    if (aid) pace -= M.DRS_PACE * aidShare;
    car.aidOpen = aid;

    let lapTime = refLap * (1 + pace);
    if (flag.kind === 'safety-car') lapTime = Math.max(lapTime, refLap * CATCH_UP_PACE);
    else if (flag.kind === 'virtual-safety-car') lapTime = Math.max(lapTime, refLap * VIRTUAL_PACE);
    if (state.time <= GETAWAY) lapTime *= 2;

    let seconds = TICK;
    if (car.owed > 0) {
      const lost = Math.min(car.owed, TICK * 0.5);
      car.owed -= lost;
      seconds -= lost;
    }
    const reach = seconds / lapTime;
    let go = reach;

    if (ahead) {
      const target = ahead.done ? ahead.to : ahead.at;
      const distance = frac(target - mover.at);
      const minGap = (green ? MIN_GAP : 0.45) / own;
      const room = distance - minGap;
      const other = ahead.car;
      if (reach <= room) {
        car.held = 0;
      } else if (!other || !green || !ahead.done) {
        go = Math.max(0, Math.min(reach, room));
      } else {
        const lead = mover.at - ahead.at;
        if (other.owed > 0.5 || Math.abs(lead) > 0.5) {
          // A car in trouble, or one on another lap: the quicker car is let through.
          if (reach > distance) {
            if (lead > 0.5) {
              other.owed += 0.45;
              car.owed += 0.2;
            } else if (lead < -0.5) {
              car.owed += 0.2;
            } else {
              overtaken(state, car, other, true);
            }
            ring[i] = ahead;
            ring[(i + 1) % count] = mover;
          }
          car.held = 0;
        } else {
          // Racing for position: hold station, and look for a way by.
          go = Math.min(reach, room);
          if (go < reach * 0.9) go = Math.min(reach * 0.9, distance - 1e-5);
          go = Math.max(0, go);
          if ((distance - go) * own <= CONTACT) {
            car.held += TICK;
            const me = grid[car.entrant]!.ratings;
            const them = grid[other.entrant]!.ratings;
            const risk =
              TOUCH *
              ((me.aggression + them.aggression) / 140) *
              (1 + 1.5 * state.wetness) *
              (bunched ? BUNCHED : 1) *
              (2 - Math.min(me.racecraft, them.racecraft) / 100) *
              (1 + 2 * Math.max(M.stressShare(car.stress), M.stressShare(other.stress)));
            if (chance(state, risk * reach)) {
              collide(state, car, other);
            } else if (state.time >= car.noAttackBefore) {
              let advantage = (ahead.free - mover.free) * 100 + (me.racecraft - them.racecraft) * 0.012;
              if (aid && !other.aidOpen) advantage += M.DRS_DUEL * aidShare;
              if (car.battery > 0) advantage += M.energyEffect(rules, car.energyMode, true).duel;
              if (other.battery > 0) advantage -= M.energyEffect(rules, other.energyMode, other.gapAhead < M.AID_RANGE).duel;
              const perLap = M.passChance(advantage, traits.overtaking, bunched);
              // Somewhere to go: not straight into the back of the next car up the road.
              const beyond = count > 2 ? ring[(i + 2) % count]! : null;
              const space = beyond && beyond.done ? frac(beyond.to - ahead.to) : 1;
              if (space > minGap * 1.1 && chance(state, 1 - Math.pow(1 - perLap, reach))) {
                go = frac(ahead.to - mover.at) + minGap * 0.5;
                other.owed += 0.3;
                other.noAttackBefore = state.time + 3;
                car.noAttackBefore = state.time + 1;
                car.held = 0;
                overtaken(state, car, other, false);
                ring[i] = ahead;
                ring[(i + 1) % count] = mover;
              }
            }
          } else {
            car.held = 0;
          }
        }
      }
    }
    mover.to = mover.at + go;
    mover.done = true;
  }
  return ring;
}

// ── Pit lane ────────────────────────────────────────────────────────────────────────────────

function enterPits(state: RaceState, car: CarState, crossedAt: number): void {
  const { setup } = state;
  const entrant = setup.grid[car.entrant]!;
  const call = car.pitCall!;
  const forced = car.forcedStop;
  car.pitCall = null;
  car.forcedStop = false;

  const usual = M.stopSeconds(setup.season);
  const crew = (100 - entrant.car.pitCrew) / 100;
  let stationary = usual + crew * 1.6 + Math.abs(gaussian(state)) * 0.3;
  if (chance(state, 0.03 + crew * 0.1)) stationary += between(state, 2, 9);
  if (car.damage > 0.0015) stationary += between(state, 5, 9);
  for (const other of state.cars) {
    // Queued behind the team's other car.
    if (other !== car && other.status === 'pit' && setup.grid[other.entrant]!.team === entrant.team) {
      if (other.pitDuration - other.pitTimeLeft < 6) stationary += 4;
    }
  }

  const flag = state.flag.kind;
  const share = flag === 'safety-car' ? SAFETY_CAR_STOP : flag === 'virtual-safety-car' ? VIRTUAL_STOP : 1;
  const lapNow =
    setup.refLap * (flag === 'safety-car' ? SAFETY_CAR_PACE : flag === 'virtual-safety-car' ? VIRTUAL_PACE : 1.05);
  car.pitDuration = PIT_LANE * lapNow + setup.traits.pitLoss * share + (stationary - usual);
  car.pitTimeLeft = car.pitDuration - (state.time - crossedAt);
  car.status = 'pit';
  car.pos = car.lap;
  car.rate = 0;
  car.aidOpen = false;
  car.held = 0;

  car.tyre = call.compound;
  car.wear = 0;
  car.tyreLaps = 0;
  if (!car.usedCompounds.includes(call.compound)) car.usedCompounds.push(call.compound);
  car.stops += 1;
  car.damage = 0;
  const planned = car.plan.some((stop) => stop.lap <= car.lap);
  car.plan = car.plan.filter((stop) => stop.lap > car.lap);
  // A stop the player called ahead of the plan is the plan's next stop, made early.
  if (!car.auto && !forced && !planned) car.plan.shift();
  delete car.told['tyres-going'];
  delete car.told['tyres-gone'];
  note(state, { type: 'pit', car: car.id, compound: call.compound, stationary: Math.round(stationary * 10) / 10 });
}

function pitLane(state: RaceState): void {
  for (const car of state.cars) {
    if (car.status !== 'pit') continue;
    car.pitTimeLeft -= TICK;
    const through = clamp(1 - car.pitTimeLeft / car.pitDuration, 0, 1);
    const pos = car.lap + PIT_LANE * through;
    car.rate = (pos - car.pos) / TICK;
    car.pos = pos;
    car.lapCautioned = true;
    if (car.pitTimeLeft <= 0) {
      car.status = 'running';
      car.coldUntil = state.time + M.COLD_SECONDS;
      car.gapAhead = 99;
    }
  }
}

// ── The driver on the radio ─────────────────────────────────────────────────────────────────

function radio(state: RaceState, car: CarState): void {
  const { setup } = state;
  if (!setup.grid[car.entrant]!.player) return;
  const tyre = facts(setup).compounds.get(car.tyre)!;
  if (car.wear > 1.02) tell(state, car, 'tyres-gone', 3);
  else if (car.wear > 0.85) tell(state, car, 'tyres-going', 999);

  const toRun = lapsToGo(state, car) + 1 - frac(car.pos);
  if (car.fuel < toRun * M.ENGINE[car.engineMode].burn) tell(state, car, 'fuel-low', 4);

  const call = tyreCall(state, tyre.kind);
  if (call.kind !== tyre.kind && call.gain > 0.02 && !car.pitCall) {
    tell(state, car, call.kind === 'dry' ? 'want-slicks' : call.kind === 'inter' ? 'want-inters' : 'want-wets', 2);
  }
  if (car.held > 4 * facts(setup).nominal) tell(state, car, 'stuck-behind', 8);
}

// ── One step ────────────────────────────────────────────────────────────────────────────────

function finish(state: RaceState, car: CarState, at: number): void {
  car.status = 'finished';
  car.finishTime = at;
  car.rate = 0;
  car.aidOpen = false;
  const place = state.cars.filter((other) => other.status === 'finished').length;
  note(state, { type: 'finish', car: car.id, position: place });
}

function crossLine(state: RaceState, car: CarState, at: number, leads: boolean): void {
  const { setup } = state;
  const lapTime = at - car.lapStartedAt;
  car.lapStartedAt = at;
  car.lap = Math.floor(car.pos);
  car.lastLap = lapTime;
  if (!car.lapCautioned) {
    if (car.bestLap === null || lapTime < car.bestLap) car.bestLap = lapTime;
    if (car.lap >= 2 && (!state.fastestLap || lapTime < state.fastestLap.lapTime)) {
      state.fastestLap = { car: car.id, lapTime, lap: car.lap };
      if (car.lap >= 4) note(state, { type: 'fastest-lap', car: car.id, lapTime });
    }
  }
  car.lapCautioned = state.flag.kind !== 'green';
  const ratings = setup.grid[car.entrant]!.ratings;
  car.noise = gaussian(state) * M.lapNoise(ratings.consistency) * (1 + state.wetness);

  if (leads) {
    state.lap = Math.max(state.lap, car.lap);
    if (state.flag.kind === 'safety-car') {
      state.flag.lapsLeft -= 1;
      if (state.flag.lapsLeft <= 0) {
        if (state.wetness > 0.75) state.flag.lapsLeft = 1;
        else goGreen(state, true);
      }
    }
  }
  // The flag falls for the first car to cover the distance, or for the leader once time is up.
  if (!state.chequered && (car.lap >= setup.laps || (leads && state.time >= TIME_LIMIT))) {
    state.chequered = true;
    state.chequeredAt = at;
    state.endedEarly = car.lap < setup.laps;
  }
  if (state.chequered) finish(state, car, at);
  else if (car.pitCall) enterPits(state, car, at);
}

/** Works out the running order and the gaps. */
function order(state: RaceState): void {
  const { nominal } = facts(state.setup);
  const rank = (car: CarState): number => (car.status === 'finished' ? 0 : car.status === 'out' ? 2 : 1);
  // Once the flag is out, a car still running will finish with the lap it is on.
  const laps = (car: CarState): number =>
    car.status === 'finished' ? car.lap : state.chequered ? Math.floor(car.pos) + 1 : car.pos;
  const sorted = [...state.cars].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra === 2 || rb === 2) return ra !== rb ? ra - rb : b.lap - a.lap || b.pos - a.pos;
    if (state.chequered && laps(a) !== laps(b)) return laps(b) - laps(a);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return b.lap - a.lap || a.finishTime! - b.finishTime!;
    return b.pos - a.pos;
  });
  const leader = sorted[0]!;
  let previous = leader;
  sorted.forEach((car, place) => {
    car.position = place + 1;
    if (car.status === 'running' || car.status === 'pit') {
      const deficit = Math.max(0, leader.pos - car.pos);
      car.lapsDown = Math.floor(deficit + 1e-9);
      car.gap = (deficit - car.lapsDown) * nominal;
      car.interval = Math.max(0, previous.pos - car.pos) * nominal;
    }
    previous = car;
  });
  let lap = state.lap;
  for (const car of state.cars) if (car.lap > lap) lap = car.lap;
  state.lap = lap;
}

/** Moves the race on by one second. */
export function step(state: RaceState): void {
  if (state.phase === 'grid') launch(state);
  if (state.phase !== 'racing') return;
  const { setup } = state;
  state.time += TICK;

  weather(state);
  if (state.flag.kind === 'virtual-safety-car' && state.time >= state.flag.until) goGreen(state, false);
  pitLane(state);

  const flag = state.flag.kind;
  const green = flag === 'green';
  const known = facts(setup);
  const crossings: { car: CarState; at: number }[] = [];

  for (const mover of move(state)) {
    const car = mover.car;
    if (!car || car.status !== 'running') continue;
    const before = car.pos;
    const travelled = mover.to - before;
    car.pos = mover.to;
    car.rate = travelled / TICK;

    const entrant = setup.grid[car.entrant]!;
    const tyre = known.compounds.get(car.tyre)!;
    const mode = M.ENGINE[car.engineMode];
    const easy = flag === 'safety-car' ? 0.25 : flag === 'virtual-safety-car' ? 0.45 : 1;
    const wearRate =
      (M.tyreCare(entrant.ratings.tyres) / tyre.life) *
      mode.tyres *
      M.PUSH[car.push].tyres *
      (1 + M.FUEL_WEAR * (car.fuel / setup.fullDistanceLaps)) *
      (1 + 0.1 * mover.closeness) *
      M.overheating(tyre.kind, state.wetness) *
      easy;
    car.wear += wearRate * travelled;
    car.tyreLaps += travelled;

    car.fuel -= (green ? mode.burn : flag === 'safety-car' ? 0.45 : 0.6) * travelled;
    if (car.fuel <= 0) {
      car.fuel = 0;
      retire(car, 'Out of fuel');
      note(state, { type: 'out-of-fuel', car: car.id });
      neutralise(state, 'light', 'Stopped car');
      continue;
    }

    if (setup.rules.recovery !== 'none') {
      const effect = M.energyEffect(setup.rules, car.energyMode, car.gapAhead < M.AID_RANGE);
      car.battery = clamp(car.battery + (green ? effect.charge : M.CAUTION_CHARGE) * travelled, 0, 100);
      if (car.battery <= 0 && effect.charge < 0) {
        car.energyMode = 'balanced';
        tell(state, car, 'battery-empty', 1);
      }
    }
    car.engineWear += (mode.wear * (green ? 1 : 0.4) * travelled) / setup.fullDistanceLaps;

    // Stress: built by pushing and by holding off a car right behind, shed at lower levels.
    const build = M.stressBuild(entrant.ratings.consistency);
    let change = green ? M.PUSH[car.push].stress : -M.CAUTION_CALM;
    if (change > 0) change *= build;
    if (green && car.gapBehind < 0.8 && state.lap >= state.bunchedUntilLap) {
      change += M.DEFENDING_STRESS * M.DEFENDING_SHARE[car.push] * build;
    }
    car.stress = clamp(car.stress + change * travelled, 0, 100);
    if (car.stress > 80) tell(state, car, 'on-the-limit', 4);

    hazards(state, car, travelled);
    if (car.status !== 'running') continue;

    // The pit wall makes its call late in the lap.
    if (car.pos > 0 && frac(car.pos) >= 0.82 && car.decidedOnLap !== Math.floor(car.pos)) {
      car.decidedOnLap = Math.floor(car.pos);
      const call = pitDecision(state, car);
      if (call && !car.pitCall) car.pitCall = call;
      radio(state, car);
    }
    if (car.auto && (state.time + car.entrant) % 4 === 0) driveModes(state, car);

    if (car.pos >= 1 && Math.floor(car.pos) > Math.floor(before)) {
      const over = frac(car.pos) / Math.max(car.rate, 1e-9);
      crossings.push({ car, at: state.time - Math.min(TICK, over) });
    }
  }

  const leader = leaderOf(state);
  crossings.sort((a, b) => a.at - b.at);
  for (const { car, at } of crossings) {
    if (car.status === 'running') crossLine(state, car, at, car === leader);
  }
  if (state.redFlagDue !== null) {
    const reason = state.redFlagDue;
    state.redFlagDue = null;
    redFlag(state, reason, false);
  }

  order(state);

  const active = activeCars(state);
  if (active.length === 0) {
    state.phase = 'finished';
  } else if (state.chequered && state.time > state.chequeredAt! + setup.refLap * 2.5) {
    // Anyone still circulating long after the flag is counted where they are.
    for (const car of active) {
      car.status = 'finished';
      car.finishTime = state.time;
    }
    state.phase = 'finished';
  }
  if (state.phase === 'finished') order(state);
}

/** Runs the race for a number of seconds, or until it ends. */
export function advance(state: RaceState, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds && state.phase !== 'finished'; elapsed += TICK) step(state);
}

/** Runs the race to its end. */
export function runToEnd(state: RaceState): void {
  // Four hours of racing is far more than any race lasts: a guard, not a rule.
  for (let steps = 0; steps < 4 * 3600 && state.phase !== 'finished'; steps++) step(state);
  if (state.phase !== 'finished') throw new Error('The race did not finish');
}

// ── The result ──────────────────────────────────────────────────────────────────────────────

/**
 * The classification. Cars are ranked by laps completed, then by when they completed the last of
 * them; a car that retired is still classified if it covered nine tenths of the winner's distance.
 */
export function classification(state: RaceState): ResultRow[] {
  const { setup } = state;
  const rules = rulesFor(setup.season);
  const gridPlace = new Map(setup.grid.map((entrant, index) => [entrant.id, index + 1]));

  // A dry race needs two dry compounds. Breaking that means disqualification, or thirty seconds
  // if the race was stopped and never restarted.
  const broken = (car: CarState): boolean =>
    setup.kind === 'race' &&
    car.status === 'finished' &&
    ruleApplies(state, car) &&
    new Set(car.usedCompounds).size < 2;
  const disqualified = (car: CarState): boolean => broken(car) && !state.abandoned;
  const lineTime = (car: CarState): number => car.lapStartedAt + (broken(car) && state.abandoned ? 30 : 0) + car.penalty;

  const ranked = state.cars
    .filter((car) => !disqualified(car))
    .sort((a, b) => b.lap - a.lap || lineTime(a) - lineTime(b) || a.position - b.position);
  const winner = ranked[0];
  const winnerLaps = winner ? winner.lap : 0;
  const needed = Math.floor(winnerLaps * 0.9);

  const outcome = {
    lapsCompleted: winnerLaps,
    lapsScheduled: setup.laps,
    finale: setup.finale,
    resumed: !state.abandoned,
  };
  const table = setup.kind === 'sprint' ? rules.sprintPoints : racePointsTable(rules, outcome);
  const bonus = setup.kind === 'race' && fastestLapPointOffered(rules, outcome);

  const rows: ResultRow[] = [];
  const add = (car: CarState, classified: boolean, status: string): void => {
    const entrant = setup.grid[car.entrant]!;
    const position = rows.length + 1;
    const fastest = state.fastestLap?.car === car.id;
    let points = classified ? (table[position - 1] ?? 0) : 0;
    if (bonus && fastest && classified && position <= 10) points += 1;
    rows.push({
      position,
      car: car.id,
      driver: entrant.driver,
      team: entrant.team,
      laps: car.lap,
      time: classified && car.status === 'finished' && car.lap === winnerLaps ? lineTime(car) : null,
      status,
      classified,
      points,
      grid: gridPlace.get(car.id)!,
      stops: car.stops,
      bestLap: car.bestLap,
      fastestLap: fastest,
      engineWear: car.engineWear,
    });
  };
  const status = (car: CarState): string => {
    if (car.status === 'out') return car.retiredWith ?? 'Retired';
    const down = winnerLaps - car.lap;
    return down <= 0 ? 'Finished' : down === 1 ? '+1 lap' : `+${down} laps`;
  };
  for (const car of ranked) if (car.lap >= needed && winnerLaps > 0) add(car, true, status(car));
  for (const car of ranked) if (!(car.lap >= needed && winnerLaps > 0)) add(car, false, status(car));
  for (const car of state.cars) if (disqualified(car)) add(car, false, 'Disqualified');
  return rows;
}
