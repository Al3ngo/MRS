import { useState } from 'preact/hooks';
import { updateCareer } from '../../app/session';
import { teamContext, type CareerState } from '../../game/career';
import { driver as driverFact } from '../../game/data';
import {
  chooseEngine,
  chooseSponsor,
  customerMakers,
  driverAsk,
  driverIn,
  driverMarket,
  engineLease,
  engineStrength,
  offerDriver,
  offerStaff,
  releaseDriver,
  STAFF_ROLES,
  staffOfferAsk,
  standingOf,
  willTalk,
  type MarketDriver,
  type StaffMember,
  type StaffRole,
} from '../../game/team';
import { Meter } from '../Meter';
import { Sheet } from '../Sheet';
import { teamAct } from './Business';
import { stageOf } from './Lifecycle';
import {
  ROLE_LINES,
  ROLE_NAMES,
  TIER_NAMES,
  TRAIT_NAMES,
  cash,
  engineMakerName,
  skillWord,
  targetWords,
  traitLine,
} from './businessWords';
import { driverName } from './names';

/**
 * Between seasons, Golden Lap style: sign the drivers and staff for the year, choose an engine
 * supplier (customer teams), and sign a title sponsor. The season's first session waits until all
 * three are done.
 */

export type WinterSheet = 'contracts' | 'engine' | 'sponsor' | null;

const STEP_WORDS = {
  contracts: { title: 'Drivers and staff', line: 'Contracts have run out: fill both seats and every role.' },
  engine: { title: 'Engine supplier', line: 'Choose who builds your engines this season.' },
  sponsor: { title: 'Title sponsor', line: 'Choose one of three offers for the season.' },
} as const;

export function WinterCard({ career, open }: { career: CareerState; open: (sheet: WinterSheet) => void }) {
  const outfit = career.outfit;
  if (!outfit || outfit.preseason.length === 0) return null;
  const midSeason = career.results.length > 0 || career.phase === 'management';
  return (
    <section class="card" aria-labelledby="winter">
      <h2 class="card__title" id="winter">
        {midSeason ? 'Before the next race' : `Before the ${career.seasonYear} season`}
      </h2>
      <p class="muted">{midSeason ? 'A seat is empty: sign a driver without a seat to fill it.' : 'Settle these, then the season can start.'}</p>
      <div class="choices">
        {outfit.preseason.map((step) => (
          <button type="button" class="choice" key={step} onClick={() => open(step)}>
            <span class="choice__name">
              <span>{midSeason && step === 'contracts' ? 'A seat to fill' : STEP_WORDS[step].title}</span>
              <span class="choice__detail">{midSeason && step === 'contracts' ? 'Sign a driver without a seat.' : STEP_WORDS[step].line}</span>
            </span>
            <span class="choice__note">Open</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function WinterSheets({ career, sheet, close }: { career: CareerState; sheet: WinterSheet; close: () => void }) {
  if (sheet === 'sponsor') return <SponsorSheet career={career} close={close} />;
  if (sheet === 'engine') return <EngineSheet career={career} close={close} />;
  if (sheet === 'contracts') return <ContractsSheet career={career} close={close} />;
  return null;
}

function SponsorSheet({ career, close }: { career: CareerState; close: () => void }) {
  const offers = career.outfit?.sponsorOffers ?? [];
  return (
    <Sheet title="Sign a title sponsor" onClose={close}>
      <p class="muted">
        Each pays a fixed sum after every Grand Prix, and a bonus whenever a car reaches its target. Steady pays more for
        turning up; bold pays more for results. Better seasons bring richer offers.
      </p>
      <div class="choices">
        {offers.map((offer) => (
          <button
            type="button"
            class="choice"
            key={offer.id}
            onClick={() => {
              teamAct((outfit) => chooseSponsor(outfit, offer.id));
              close();
            }}
          >
            <span class="choice__name">
              <span>
                {offer.name} · {TIER_NAMES[offer.tier]}
              </span>
              <span class="choice__detail">
                {cash(offer.base)} a race, plus {cash(offer.bonus)} for {targetWords(offer.target)}
              </span>
            </span>
            <span class="choice__note">Sign</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function EngineSheet({ career, close }: { career: CareerState; close: () => void }) {
  const season = career.seasonYear;
  const makers = customerMakers(season);
  const current = career.outfit?.engine;
  const strengths = makers.map((maker) => engineStrength(maker, season));
  const lowPower = Math.min(...strengths.map((value) => value[0])) - 1;
  const highPower = Math.max(...strengths.map((value) => value[0])) + 1;
  const lowRel = Math.min(...strengths.map((value) => value[1])) - 1;
  const highRel = Math.max(...strengths.map((value) => value[1])) + 1;
  return (
    <Sheet title={`Engines for ${season}`} onClose={close}>
      <p class="muted">A customer team buys its engines for the season and gets the maker’s progress. Better engines cost more.</p>
      <div class="choices">
        {makers.map((maker, index) => {
          const [power, reliability] = strengths[index]!;
          return (
            <button
              type="button"
              key={maker}
              class={`choice${maker === current ? ' choice--on' : ''}`}
              onClick={() => {
                teamAct((outfit, ctx) => chooseEngine(outfit, ctx, maker));
                close();
              }}
            >
              <span class="choice__name">
                <span>{engineMakerName(maker)}{maker === current ? ' (now)' : ''}</span>
                <span class="choice__bars">
                  <span class="choice__detail">Power</span>
                  <Meter fill={(power - lowPower) / (highPower - lowPower)} size="small" label={`${engineMakerName(maker)} power`} />
                  <span class="choice__detail">Reliability</span>
                  <Meter fill={(reliability - lowRel) / (highRel - lowRel)} size="small" label={`${engineMakerName(maker)} reliability`} />
                </span>
              </span>
              <span class="choice__note figure">{cash(engineLease(maker, season))}</span>
            </button>
          );
        })}
      </div>
      <p class="muted">The price is for the whole season, paid race by race.</p>
    </Sheet>
  );
}

type Offer = { kind: 'driver'; id: string } | { kind: 'staff'; member: StaffMember } | null;

function ContractsSheet({ career, close }: { career: CareerState; close: () => void }) {
  const [market, setMarket] = useState<'drivers' | StaffRole | null>(null);
  const [offer, setOffer] = useState<Offer>(null);
  const outfit = career.outfit;
  if (!outfit) return null;
  const season = career.seasonYear;
  const signed = outfit.drivers.filter((contract) => contract.until >= season);
  const lapsed = outfit.drivers.filter((contract) => contract.until < season);

  // After a signing, back to the contracts to see what is left; otherwise back to the list.
  if (offer) {
    return (
      <OfferSheet
        career={career}
        offer={offer}
        back={(signed) => {
          setOffer(null);
          if (signed) setMarket(null);
        }}
      />
    );
  }
  if (market === 'drivers') return <DriverMarket career={career} pick={(id) => setOffer({ kind: 'driver', id })} back={() => setMarket(null)} />;
  if (market) return <StaffMarket career={career} role={market} pick={(member) => setOffer({ kind: 'staff', member })} back={() => setMarket(null)} />;

  return (
    <Sheet title={`Contracts for ${season}`} onClose={close}>
      <h3 class="card__subtitle">Drivers</h3>
      <ul class="people">
        {signed.map((contract) => (
          <li class="person" key={contract.driver}>
            <span class="person__name">{driverName(contract.driver)}</span>
            <span class="person__detail">
              Signed to {contract.until} · {cash(contract.salary)} a season
            </span>
          </li>
        ))}
        {lapsed.map((contract) => (
          <li class="person" key={contract.driver}>
            <span class="person__name">{driverName(contract.driver)}</span>
            <span class="person__detail">Contract ended</span>
            <span class="person__actions">
              <button type="button" class="button button--secondary" onClick={() => setOffer({ kind: 'driver', id: contract.driver })}>
                Renew
              </button>
              <button type="button" class="button button--quiet" onClick={() => teamAct((current, ctx) => releaseDriver(current, ctx, contract.driver))}>
                Let go
              </button>
            </span>
          </li>
        ))}
      </ul>
      {signed.length < 2 && (
        <button type="button" class="button button--secondary button--block" onClick={() => setMarket('drivers')}>
          Find a driver ({2 - signed.length} {signed.length === 1 ? 'seat' : 'seats'} to fill)
        </button>
      )}

      <h3 class="card__subtitle">Staff</h3>
      <ul class="people">
        {STAFF_ROLES.map((role) => {
          const member = outfit.staff.find((candidate) => candidate.role === role);
          const current = member && member.until >= season;
          return (
            <li class="person" key={role}>
              <span class="person__name">{ROLE_NAMES[role]}</span>
              <span class="person__detail">
                {member ? `${member.name}, ${skillWord(member.skill)}` : 'Nobody'}
                {current ? ` · signed to ${member.until}` : member ? ' · contract ended' : ''}
              </span>
              {!current && (
                <span class="person__actions">
                  {member && (
                    <button type="button" class="button button--secondary" onClick={() => setOffer({ kind: 'staff', member })}>
                      Renew
                    </button>
                  )}
                  <button type="button" class="button button--quiet" onClick={() => setMarket(role)}>
                    {member ? 'Look for someone else' : 'Hire'}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div class="sheet__actions">
        <button type="button" class="button button--block button--secondary" onClick={close}>
          Close
        </button>
      </div>
    </Sheet>
  );
}

const STATUS_WORDS: Readonly<Record<MarketDriver['status'], string>> = {
  yours: 'Your driver, contract ended',
  moving: 'Moving teams',
  rookie: 'New to the sport',
  returning: 'Without a seat',
  academy: 'From your academy',
  free: 'Without a seat',
};

function DriverMarket({ career, pick, back }: { career: CareerState; pick: (id: string) => void; back: () => void }) {
  const outfit = career.outfit!;
  const ctx = teamContext(career);
  const standing = standingOf(outfit, ctx.team, ctx.season);
  const list = driverMarket(outfit, ctx);
  return (
    <Sheet title="Drivers on the market" onClose={back}>
      <p class="muted">
        Drivers whose contracts have run out, who are without a seat, or who are new. The best only talk to teams that can
        win. The bar is how good each driver is overall.
      </p>
      <div class="choices">
        {list.map((entry) => {
          const talks = willTalk(entry.overall, standing);
          return (
            <button type="button" class="choice" key={entry.driver} disabled={!talks} onClick={() => pick(entry.driver)}>
              <span class="choice__name">
                <span>
                  {driverName(entry.driver)}, {entry.age}
                </span>
                <Meter fill={(entry.overall - 60) / 40} size="small" label={`${driverName(entry.driver)}: ${entry.overall} overall`} />
                <span class="choice__detail">
                  {talks ? `${STATUS_WORDS[entry.status]} · ${stageOf(career, entry.driver).toLowerCase()}` : 'Not interested: wants a team that can win'}
                  {entry.backing > 0 ? ` · backers pay ${cash(entry.backing)} a season` : ''}
                </span>
              </span>
              <span class="choice__note figure">{cash(entry.ask)}</span>
            </button>
          );
        })}
      </div>
      <p class="muted">Asking salary a season, on a one-season contract.</p>
    </Sheet>
  );
}

function StaffMarket({ career, role, pick, back }: { career: CareerState; role: StaffRole; pick: (member: StaffMember) => void; back: () => void }) {
  const pool = (career.outfit?.market?.staffPool ?? []).filter((member) => member.role === role).sort((a, b) => b.skill - a.skill);
  return (
    <Sheet title={`${ROLE_NAMES[role]}s looking for work`} onClose={back}>
      <p class="muted">{ROLE_LINES[role]}</p>
      <div class="choices">
        {pool.map((member) => (
          <button type="button" class="choice" key={member.id} onClick={() => pick(member)}>
            <span class="choice__name">
              <span>
                {member.name}, {member.age}
              </span>
              <Meter fill={member.skill / 100} size="small" label={`${member.name}: ${skillWord(member.skill)}`} />
              <span class="choice__detail">
                {skillWord(member.skill)}
                {member.traits.map((trait) => ` · ${TRAIT_NAMES[trait]}: ${traitLine(trait, role).toLowerCase()}`).join('')}
              </span>
            </span>
            <span class="choice__note figure">{cash(staffOfferAsk(career.outfit!, member))}</span>
          </button>
        ))}
      </div>
      <p class="muted">Asking salary a season.</p>
    </Sheet>
  );
}

function OfferSheet({ career, offer, back }: { career: CareerState; offer: NonNullable<Offer>; back: (signed: boolean) => void }) {
  const [length, setLength] = useState(2);
  const [answer, setAnswer] = useState<string | null>(null);
  const outfit = career.outfit!;
  const season = career.seasonYear;
  const isDriver = offer.kind === 'driver';
  const name = isDriver ? driverName(offer.id) : offer.member.name;
  const entry = isDriver ? driverIn(offer.id, season) : undefined;
  const ask = isDriver ? (entry ? driverAsk(entry, length) : 0) : staffOfferAsk(outfit, offer.member);
  const signedNow = isDriver
    ? outfit.drivers.some((contract) => contract.driver === offer.id && contract.until >= season)
    : outfit.staff.some((member) => member.id === offer.member.id && member.until >= season);

  const make = (lower: boolean): void => {
    let result = '';
    void updateCareer((current) => {
      if (!current.outfit) return current;
      const ctx = teamContext(current);
      const outcome = isDriver
        ? offerDriver(current.outfit, ctx, offer.id, length, lower)
        : offerStaff(current.outfit, ctx, offer.member.id, length, lower);
      result = outcome.result;
      return { ...current, outfit: outcome.outfit };
    });
    setAnswer(
      result === 'signed'
        ? `${name} has signed, to ${season + length - 1}.`
        : result === 'refused'
          ? `${name} turned it down, and will not hear a lower offer again this winter.`
          : result === 'not-interested'
            ? `${name} is not interested: only a team that can win will do.`
            : result === 'no-seat'
              ? 'Both seats are already taken.'
              : 'That offer could not be made.',
    );
  };

  return (
    <Sheet title={`An offer to ${name}`} onClose={() => back(signedNow)}>
      {!isDriver && <p class="muted">{ROLE_LINES[offer.member.role]}</p>}
      {isDriver && entry && (
        <p class="muted">
          {driverFact(offer.id)?.nationality}, {entry.age}. Young drivers want more for a long deal; older ones take less for security.
        </p>
      )}
      <div class="segmented" role="group" aria-label="Contract length">
        {[1, 2, 3].map((years) => (
          <button
            type="button"
            key={years}
            class={`segmented__option${years === length ? ' segmented__option--on' : ''}`}
            aria-pressed={years === length}
            onClick={() => setLength(years)}
          >
            {years} {years === 1 ? 'season' : 'seasons'}
          </button>
        ))}
      </div>
      <p class="offer">
        Asks <span class="figure">{cash(ask)}</span> a season
        {!isDriver && outfit.staff.some((member) => member.id === offer.member.id) ? ' (renewing keeps the salary)' : ''}.
      </p>
      {answer && <p class="offer__answer">{answer}</p>}
      <div class="sheet__actions">
        {!signedNow && (
          <>
            <button type="button" class="button button--primary button--block" onClick={() => make(false)}>
              Offer {cash(ask)} a season
            </button>
            <button type="button" class="button button--secondary button--block" onClick={() => make(true)}>
              Offer less: {cash(Math.round(ask * 8.5) / 10)}
            </button>
          </>
        )}
        <button type="button" class="button button--quiet button--block" onClick={() => back(signedNow)}>
          {signedNow ? 'Done' : 'Back'}
        </button>
      </div>
    </Sheet>
  );
}
