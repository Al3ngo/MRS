/**
 * The player's team off the track: money, sponsor, people, the car's development and its power
 * units. The career keeps one of these from the moment a team is chosen. Plain data, saved as is.
 *
 * Money is in the game's own small units (the brief's scale: the best driver costs around 20 a
 * season; the 2021 budget cap is 145). Amounts are kept to one decimal place.
 */

/** The parts of the car the team develops. Which exist depends on the era (see partsIn). */
export type PartId = 'aero' | 'chassis' | 'engine' | 'battery' | 'recovery';

export interface PartState {
  /** Performance against the real car of this team and season, in car-rating points. */
  perf: number;
  /** Reliability against the real car, in reliability points: new parts are fragile, upgrades help. */
  rel: number;
  /** New versions built this season: each costs more than the last. */
  builds: number;
  upgrades: number;
}

export type StaffRole = 'technical-director' | 'aerodynamicist' | 'race-engineer' | 'strategist' | 'pit-crew-chief';

export type TraitId = 'innovator' | 'meticulous' | 'thrifty' | 'rising' | 'veteran' | 'demanding' | 'rain-reader' | 'calm';

export interface StaffMember {
  id: string;
  name: string;
  nationality: string;
  role: StaffRole;
  /** How good they are at the job, 1 to 100. */
  skill: number;
  traits: TraitId[];
  age: number;
  /** Money a season, paid race by race. */
  salary: number;
  /** Last season of the contract. */
  until: number;
}

export interface DriverContract {
  driver: string;
  /** Money a season, paid race by race. */
  salary: number;
  /** Money a season his backers pay the team, race by race. Most drivers have none. */
  backing: number;
  /** Last season of the contract. */
  until: number;
}

export interface SponsorDeal {
  id: string;
  name: string;
  /** Steady pays more for turning up; bold pays more for results. */
  tier: 'steady' | 'balanced' | 'bold';
  /** Paid after every Grand Prix. */
  base: number;
  /** Paid after a Grand Prix where a car finishes at or above `target`. */
  bonus: number;
  target: number;
}

export type ChallengeKind = 'both-points' | 'car-top' | 'gain-places' | 'beat-team' | 'both-finish' | 'grid-top';

/** A sponsor's one-off offer for the next Grand Prix. */
export interface Challenge {
  id: string;
  kind: ChallengeKind;
  /** The place, or number of places, the challenge is about. */
  target: number;
  /** The team to beat, for 'beat-team'. */
  rival: string | null;
  reward: number;
}

/** One car's power units this season. Wear is counted in race distances. */
export interface UnitState {
  /** Wear on the engine fitted now (the whole engine to 2013, the combustion engine from 2014). */
  engineWear: number;
  /** Engines fitted this season, the one in the car included. */
  engines: number;
  /** Wear on the battery fitted now; unused before 2014. */
  batteryWear: number;
  batteries: number;
}

export type LedgerKind =
  | 'backers'
  | 'prize'
  | 'sponsor'
  | 'bonus'
  | 'challenge'
  | 'backing'
  | 'drivers'
  | 'staff'
  | 'part'
  | 'next-year'
  | 'engine-deal'
  | 'fine';

/** One movement of money this season. Spending is negative. */
export interface LedgerEntry {
  /** The round it belongs to; 0 for the start of the season. */
  round: number;
  kind: LedgerKind;
  label: string;
  amount: number;
  /** Counts against the budget cap (from 2021). */
  capped: boolean;
}

/** What still has to be settled before a season's first session. */
export type PreseasonStep = 'contracts' | 'engine' | 'sponsor';

/** The driver and staff market between seasons. */
export interface MarketState {
  /** The season being signed for. */
  season: number;
  /** Staff looking for work this winter. */
  staffPool: StaffMember[];
  /** Drivers and staff who turned down a lower offer and will not hear another this winter. */
  refused: string[];
}

export interface Outfit {
  money: number;
  /** This season's money, oldest first. */
  ledger: LedgerEntry[];
  sponsor: SponsorDeal | null;
  /** The offers to choose from, while the sponsor step is open. */
  sponsorOffers: SponsorDeal[];
  /** The sponsor challenge taken on for the next Grand Prix. */
  challenge: Challenge | null;
  /** Challenges on offer for the next Grand Prix. */
  challengeOffers: Challenge[];
  /** The race drivers, in seat order: seat 1 first. */
  drivers: DriverContract[];
  /** One person in each role. */
  staff: StaffMember[];
  /** Who builds the power unit: the team itself (a works team) or its supplier. An engine maker id. */
  engine: string;
  parts: Partial<Record<PartId, PartState>>;
  /** Money put into next season's car so far this season. */
  nextYear: number;
  /** Power units of each car, in seat order. */
  units: UnitState[];
  /** Grid places each car drops at the next Grand Prix, in seat order. */
  penalties: number[];
  /** How far a budget cap breach slows development this season: 1 for none. */
  capFactor: number;
  preseason: PreseasonStep[];
  market: MarketState | null;
  /** The team's place in last season's teams' championship; null in the first season. */
  lastPlace: number | null;
  /** Things that happened, for the next management phase to tell. Cleared when it is read. */
  news: string[];
}
