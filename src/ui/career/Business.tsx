import { useState } from 'preact/hooks';
import { updateCareer } from '../../app/session';
import { withOutfit, type CareerState } from '../../game/career';
import { canDevelop, moneyView } from '../../game/season/business';
import { takeChallenge, type LedgerKind, type Outfit, type TeamContext } from '../../game/team';
import { Meter } from '../Meter';
import { Sheet } from '../Sheet';
import {
  ROLE_NAMES,
  TRAIT_NAMES,
  cash,
  challengeWords,
  newsWords,
  skillWord,
  targetWords,
  traitLine,
} from './businessWords';
import { driverName } from './names';
import { stageOf } from './Lifecycle';

/**
 * The team's business on the career's home screen: money and the budget cap, the sponsor and its
 * challenges, the drivers and staff, and the news of the last race.
 */

type Change = (outfit: Outfit, ctx: TeamContext) => Outfit | { ok: true; outfit: Outfit } | { ok: false; reason: string };

/** Applies a change to the team's business and saves; returns why it could not be done, if it could not. */
export function teamAct(change: Change): string | null {
  let reason: string | null = null;
  void updateCareer((current) => {
    const result = withOutfit(current, change);
    reason = result.reason;
    return result.career;
  });
  return reason;
}

const LEDGER_NAMES: Readonly<Record<LedgerKind, string>> = {
  backers: "Backers' money",
  prize: 'Prize money',
  sponsor: 'Sponsor',
  bonus: 'Sponsor bonuses',
  challenge: 'Sponsor challenges',
  backing: "Drivers' backers",
  drivers: "Drivers' salaries",
  staff: 'Staff salaries',
  part: 'Car development',
  'next-year': "Next year's car",
  'engine-deal': 'Engine supply',
  academy: 'Junior academy',
  fine: 'Fines',
};

export function MoneyCard({ career }: { career: CareerState }) {
  const view = moneyView(career);
  const [open, setOpen] = useState(false);
  if (!view) return null;
  const over = view.cap !== null && view.capUsed > view.cap;
  return (
    <section class="card" aria-labelledby="money">
      <h2 class="card__title" id="money">
        Money
      </h2>
      <p class="money">
        <span class={`money__figure figure${view.money < 0 ? ' money__figure--short' : ''}`}>{cash(view.money)}</span>
        <span class="muted">{view.money < 0 ? 'in debt: nothing can be bought until it is paid off' : 'in the bank'}</span>
      </p>
      <dl class="facts facts--tight">
        <div class="row">
          <dt class="row__label">This season</dt>
          <dd class="row__value">
            {view.spent > 0 ? `+${cash(view.earned)} in, −${cash(view.spent)} out` : `+${cash(view.earned)} in, nothing spent yet`}
          </dd>
        </div>
        {view.cap !== null && (
          <div class="row row--meter">
            <dt class="row__label">Budget cap</dt>
            <dd class="row__value row__value--meter">
              <Meter
                fill={view.capUsed / view.cap}
                good={over ? 0 : 1 - view.capUsed / view.cap}
                size="small"
                label={`Budget cap: ${cash(view.capUsed)} of ${view.cap} used`}
              />
              <span>
                {cash(view.capUsed)} of {view.cap}
              </span>
            </dd>
          </div>
        )}
      </dl>
      {view.cap !== null && (
        <p class="muted">
          {over
            ? `Over the cap by ${cash(view.capUsed - view.cap)}: a fine and slower development next season.`
            : 'Car development, next year’s car, the engine lease and most staff pay count against the cap. Drivers and the three best-paid staff do not.'}
        </p>
      )}
      <button type="button" class="button button--secondary button--block money__books" onClick={() => setOpen(true)}>
        See the books
      </button>
      {open && (
        <Sheet title={`The books, ${career.seasonYear}`} onClose={() => setOpen(false)}>
          <dl class="facts facts--tight">
            {(Object.keys(LEDGER_NAMES) as LedgerKind[])
              .filter((kind) => view.byKind[kind] !== undefined)
              .map((kind) => (
                <div class="row" key={kind}>
                  <dt class="row__label">{LEDGER_NAMES[kind]}</dt>
                  <dd class="row__value figure">
                    {view.byKind[kind]! > 0 ? '+' : '−'}
                    {cash(Math.abs(view.byKind[kind]!))}
                  </dd>
                </div>
              ))}
          </dl>
          <div class="sheet__actions">
            <button type="button" class="button button--block button--secondary" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

/** The team in a few lines, on the home screen: money, sponsor, this race's challenge, drivers. */
export function GlanceCard({ career }: { career: CareerState }) {
  const view = moneyView(career);
  const outfit = career.outfit;
  if (!view || !outfit) return null;
  const drivers = outfit.drivers.filter((contract) => contract.until >= career.seasonYear);
  return (
    <section class="card glance" aria-labelledby="glance">
      <h2 class="card__title" id="glance">
        The team
      </h2>
      <dl class="facts facts--tight">
        <div class="row">
          <dt class="row__label">Money</dt>
          <dd class={`row__value figure glance__money${view.money < 0 ? ' money__figure--short' : ''}`}>{cash(view.money)}</dd>
        </div>
        {view.cap !== null && (
          <div class="row">
            <dt class="row__label">Budget cap used</dt>
            <dd class="row__value">
              {cash(view.capUsed)} of {view.cap}
            </dd>
          </div>
        )}
        {outfit.sponsor && (
          <div class="row">
            <dt class="row__label">Sponsor</dt>
            <dd class="row__value">{outfit.sponsor.name}</dd>
          </div>
        )}
        {outfit.challenge && (
          <div class="row">
            <dt class="row__label">Challenge</dt>
            <dd class="row__value">{challengeWords(outfit.challenge, career.seasonYear)}</dd>
          </div>
        )}
        <div class="row">
          <dt class="row__label">Drivers</dt>
          <dd class="row__value">{drivers.map((contract) => driverName(contract.driver)).join(', ') || 'A seat to fill'}</dd>
        </div>
      </dl>
      <p class="muted">The Money and Team tabs have the rest.</p>
    </section>
  );
}

export function SponsorCard({ career, challenges = true }: { career: CareerState; challenges?: boolean }) {
  const outfit = career.outfit;
  if (!outfit?.sponsor) return null;
  const { sponsor } = outfit;
  const open = challenges && canDevelop(career) && outfit.challengeOffers.length > 0;
  return (
    <section class="card" aria-labelledby="sponsor">
      <h2 class="card__title" id="sponsor">
        {sponsor.name}
      </h2>
      <p class="muted">
        Your title sponsor pays {cash(sponsor.base)} after every Grand Prix, and {cash(sponsor.bonus)} more for {targetWords(sponsor.target)}.
      </p>
      {open && (
        <>
          <h3 class="card__subtitle">A challenge for the next race</h3>
          <div class="choices" role="radiogroup" aria-label="Sponsor challenge for the next race">
            {outfit.challengeOffers.map((offer) => {
              const on = outfit.challenge?.id === offer.id;
              return (
                <button
                  type="button"
                  key={offer.id}
                  role="radio"
                  aria-checked={on}
                  class={`choice${on ? ' choice--on' : ''}`}
                  onClick={() => teamAct((current) => takeChallenge(current, on ? null : offer.id))}
                >
                  <span class="choice__name">
                    <span>{challengeWords(offer, career.seasonYear)}</span>
                  </span>
                  <span class="choice__note figure">+{cash(offer.reward)}</span>
                </button>
              );
            })}
          </div>
          <p class="muted">Take on one, or none. It pays only if it comes off.</p>
        </>
      )}
      {!open && outfit.challenge && <p class="muted">Challenge for this race: {challengeWords(outfit.challenge, career.seasonYear)}</p>}
    </section>
  );
}

export function NewsCard({ career }: { career: CareerState }) {
  const outfit = career.outfit;
  if (!outfit || outfit.news.length === 0) return null;
  const drivers = outfit.drivers.map((contract) => contract.driver);
  const lines = outfit.news.map((item) => newsWords(item, drivers)).filter((line): line is string => line !== null);
  if (lines.length === 0) return null;
  return (
    <section class="card" aria-labelledby="news">
      <h2 class="card__title" id="news">
        From the team
      </h2>
      <ul class="news">
        {lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

export function PeopleCard({ career }: { career: CareerState }) {
  const outfit = career.outfit;
  if (!outfit) return null;
  const season = career.seasonYear;
  const drivers = outfit.drivers.filter((contract) => contract.until >= season);
  const staff = outfit.staff.filter((member) => member.until >= season);
  return (
    <section class="card" aria-labelledby="people">
      <h2 class="card__title" id="people">
        Drivers and staff
      </h2>
      <ul class="people">
        {drivers.map((contract) => (
          <li class="person" key={contract.driver}>
            <span class="person__name">{driverName(contract.driver)}</span>
            <span class="person__detail">
              Driver, {stageOf(career, contract.driver).toLowerCase()} · {cash(contract.salary)} a season to {contract.until}
              {contract.backing > 0 ? ` · backers pay you ${cash(contract.backing)}` : ''}
            </span>
          </li>
        ))}
        {staff.map((member) => (
          <li class="person" key={member.id}>
            <span class="person__name">
              {member.name}
              <Meter fill={member.skill / 100} size="small" label={`${ROLE_NAMES[member.role]}: ${skillWord(member.skill)}`} class="person__skill" />
            </span>
            <span class="person__detail">
              {ROLE_NAMES[member.role]}, {skillWord(member.skill)} · {cash(member.salary)} a season to {member.until}
            </span>
            {member.traits.length > 0 && (
              <span class="person__traits">
                {member.traits.map((trait) => (
                  <span class="trait" key={trait} title={traitLine(trait, member.role)}>
                    {TRAIT_NAMES[trait]}: {traitLine(trait, member.role).toLowerCase()}
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p class="muted">Drivers and staff are signed between seasons, when contracts run out.</p>
    </section>
  );
}
