/**
 * Sponsors, as Golden Lap has them.
 *
 * Each season the team signs one title sponsor from three offers. A deal pays a fixed sum after
 * every Grand Prix, and a bonus after any Grand Prix where one of the team's cars finishes at or
 * above the sponsor's target place. A steady deal pays well for turning up and little for results;
 * a bold one the other way round. How rich the offers are depends on the team's standing: its place
 * in last season's teams' championship, so beating expectations brings better sponsors.
 *
 * Before each Grand Prix the sponsor also offers challenges: extra money for one particular
 * result in that race. The team takes on one at most.
 */
import { teamsIn } from '../data';
import { clamp, pick, seedFrom, type Luck } from '../sim/rng';
import type { Finish } from '../season/standings';
import { money, sponsorScale } from './money';
import { sponsorName } from './names';
import type { Challenge, ChallengeKind, SponsorDeal } from './types';

/** The finishing place a balanced sponsor asks of a team at a standing: about where its better car finishes. */
const usualPlace = (standing: number): number => Math.max(1, Math.round(1.6 * standing));

/** Cars on the grid in a season, give or take. */
const fieldCars = (season: number): number => teamsIn(season).length * 2;

export function sponsorOffers(standing: number, season: number, seed: number): SponsorDeal[] {
  const luck: Luck = { rng: seedFrom(seed, 'sponsors', season) };
  const scale = sponsorScale(standing);
  const last = fieldCars(season) - 2;
  const place = usualPlace(standing);
  const names = new Set<string>();
  const name = (): string => {
    let candidate = sponsorName(luck);
    while (names.has(candidate)) candidate = sponsorName(luck);
    names.add(candidate);
    return candidate;
  };
  const deal = (tier: SponsorDeal['tier'], base: number, bonus: number, target: number): SponsorDeal => ({
    id: `${season}-${tier}`,
    name: name(),
    tier,
    base: money(base * scale),
    bonus: money(bonus * scale),
    target: clamp(target, 1, last),
  });
  return [
    deal('steady', 0.85, 0.25, place + 3),
    deal('balanced', 0.6, 0.6, place),
    deal('bold', 0.35, 1.15, place - 3),
  ];
}

/** What a sponsor pays for a Grand Prix: the fixed sum, and the bonus if earned. */
export function sponsorPay(deal: SponsorDeal, race: readonly Finish[], team: string): { base: number; bonus: number } {
  const earned = race.some((finish) => finish.team === team && finish.classified && finish.position <= deal.target);
  return { base: deal.base, bonus: earned ? deal.bonus : 0 };
}

// ── Challenges ──────────────────────────────────────────────────────────────────────────────

const KINDS: readonly ChallengeKind[] = ['car-top', 'both-points', 'gain-places', 'beat-team', 'both-finish', 'grid-top'];

/**
 * Three challenges for the next Grand Prix, fitted to the team: a front-runner is asked for a win
 * or a podium, a backmarker to bring both cars home. `rival` is the team just ahead in the teams'
 * championship (or just behind, for the leader).
 */
export function challengeOffers(
  standing: number,
  rival: string | null,
  season: number,
  round: number,
  seed: number,
): Challenge[] {
  const luck: Luck = { rng: seedFrom(seed, 'challenges', season, round) };
  const place = usualPlace(standing);
  const make: Record<ChallengeKind, () => Challenge | null> = {
    'car-top': () => ({ kind: 'car-top', target: clamp(place - 1, 1, 20), rival: null, reward: 2.5 } as Challenge),
    'both-points': () => (standing <= 7 ? ({ kind: 'both-points', target: 10, rival: null, reward: standing <= 3 ? 1.5 : 2.5 } as Challenge) : null),
    'gain-places': () => ({ kind: 'gain-places', target: standing <= 3 ? 3 : 5, rival: null, reward: 1.5 } as Challenge),
    'beat-team': () => (rival ? ({ kind: 'beat-team', target: 0, rival, reward: 2 } as Challenge) : null),
    'both-finish': () => ({ kind: 'both-finish', target: 0, rival: null, reward: standing <= 5 ? 0.8 : 1.5 } as Challenge),
    'grid-top': () => ({ kind: 'grid-top', target: clamp(place - 1, 1, 20), rival: null, reward: 1.5 } as Challenge),
  };
  const offers: Challenge[] = [];
  const left = [...KINDS];
  while (offers.length < 3 && left.length > 0) {
    const kind = pick(luck, left);
    left.splice(left.indexOf(kind), 1);
    const offer = make[kind]();
    if (offer) offers.push({ ...offer, id: `${season}-${round}-${kind}` });
  }
  return offers;
}

/** Whether a Grand Prix met a challenge. */
export function challengeMet(challenge: Challenge, race: readonly Finish[], team: string): boolean {
  const ours = race.filter((finish) => finish.team === team);
  if (ours.length === 0) return false;
  switch (challenge.kind) {
    case 'car-top':
      return ours.some((finish) => finish.classified && finish.position <= challenge.target);
    case 'both-points':
      return ours.length >= 2 && ours.every((finish) => finish.classified && finish.position <= challenge.target);
    case 'gain-places':
      return ours.some((finish) => finish.classified && finish.grid > 0 && finish.grid - finish.position >= challenge.target);
    case 'beat-team': {
      const theirs = race.filter((finish) => finish.team === challenge.rival);
      const worstOurs = Math.max(...ours.map((finish) => (finish.classified ? finish.position : Infinity)));
      const bestTheirs = Math.min(...theirs.map((finish) => (finish.classified ? finish.position : Infinity)));
      return worstOurs < bestTheirs;
    }
    case 'both-finish':
      return ours.length >= 2 && ours.every((finish) => finish.classified);
    case 'grid-top':
      return ours.some((finish) => finish.grid >= 1 && finish.grid <= challenge.target);
  }
}
