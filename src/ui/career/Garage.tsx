import { useEffect, useRef, useState } from 'preact/hooks';
import type { CareerState } from '../../game/career';
import {
  canDevelop,
  carAgainstField,
  lapSeconds,
  moneyView,
  nextYearView,
  partLevels,
  partViews,
  unitViews,
  type PartView,
} from '../../game/season/business';
import { buildPart, fitUnit, investNextYear, upgradePart, worksTeam, type PartId } from '../../game/team';
import { Meter } from '../Meter';
import { Sheet } from '../Sheet';
import { PartArt } from './PartArt';
import { ordinal } from '../race/Result';
import { teamAct } from './Business';
import { PART_NAMES, QUALITY_LINES, QUALITY_NAMES, cash, engineMakerName, partLine } from './businessWords';
import { driverName } from './names';

/**
 * The car: its parts, each drawn with its level against the field and its reliability as bars
 * (what each part does, and what working on it costs and gains, a tap away); next year's car; the
 * power units; and how the car stands against the field. Work is done between races.
 */
type View = 'parts' | 'next-year' | 'units' | 'field';

export function Garage({ career }: { career: CareerState }) {
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<View>('parts');
  const [detail, setDetail] = useState<PartId | null>(null);
  const open = canDevelop(career);
  const act = (change: Parameters<typeof teamAct>[0]): void => setMessage(teamAct(change));
  const nextYear = nextYearView(career);
  const views: [View, string][] = [
    ['parts', 'Parts'],
    ...(nextYear ? [['next-year', `${nextYear.season} car`] as [View, string]] : []),
    ...(unitViews(career).length > 0 ? [['units', 'Power units'] as [View, string]] : []),
    ['field', 'Rankings'],
  ];
  return (
    <div class="garage">
      <div class="garage__head">
        <MoneyStrip career={career} />
        <div class="segmented garage__views" role="group" aria-label="The car">
          {views.map(([id, label]) => (
            <button
              type="button"
              key={id}
              class={`segmented__option${view === id ? ' segmented__option--on' : ''}`}
              aria-pressed={view === id}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {!open && <p class="muted garage__note">The car can be worked on between races.</p>}
      {message && (
        <p class="notice" role="status">
          {message}
        </p>
      )}
      {view === 'parts' && <PartsCard career={career} open={open} act={act} onDetail={setDetail} />}
      {view === 'next-year' && <NextYearCard career={career} open={open} act={act} />}
      {view === 'units' && <UnitsCard career={career} open={open} act={act} />}
      {view === 'field' && <FieldCard career={career} />}
      {detail && <PartSheet career={career} part={detail} open={open} act={act} onClose={() => setDetail(null)} />}
    </div>
  );
}

/**
 * The money there is to spend, pinned under the top bar while the car is worked on, with what the
 * last purchase cost; from 2021, the room left under the budget cap too.
 */
function MoneyStrip({ career }: { career: CareerState }) {
  const view = moneyView(career);
  const money = view?.money ?? 0;
  const before = useRef(money);
  const [change, setChange] = useState<number | null>(null);
  useEffect(() => {
    const spent = Math.round((money - before.current) * 10) / 10;
    before.current = money;
    if (spent === 0) return;
    setChange(spent);
    const timer = setTimeout(() => setChange(null), 2400);
    return () => clearTimeout(timer);
  }, [money]);
  if (!view) return null;
  return (
    <div class="money-strip" role="status" aria-live="polite">
      <span class="money-strip__item">
        <span class="money-strip__label">{money < 0 ? 'In debt' : 'Money to spend'}</span>
        <span class={`figure money-strip__figure${money < 0 ? ' money__figure--short' : ''}`}>{cash(money)}</span>
        {change !== null && (
          <span class={`figure money-strip__change${change < 0 ? ' money-strip__change--out' : ''}`}>
            {change > 0 ? '+' : '−'}
            {cash(Math.abs(change))}
          </span>
        )}
      </span>
      {view.capRoom !== null && (
        <span class="money-strip__item money-strip__item--end">
          <span class="money-strip__label">Budget cap left</span>
          <span class={`figure money-strip__figure${view.capRoom < 0 ? ' money__figure--short' : ''}`}>{cash(view.capRoom)}</span>
        </span>
      )}
    </div>
  );
}

function FieldCard({ career }: { career: CareerState }) {
  const rows = carAgainstField(career);
  return (
    <section class="card" aria-labelledby="against-field">
      <h2 class="card__title" id="against-field">
        Your car against the field
      </h2>
      <dl class="facts facts--tight">
        {rows.map((row) => (
          <div class="row row--meter" key={row.quality}>
            <dt class="row__label">
              {QUALITY_NAMES[row.quality]}
              <span class="row__hint">{QUALITY_LINES[row.quality]}</span>
            </dt>
            <dd class="row__value row__value--meter">
              <Meter fill={row.share} size="small" label={`${QUALITY_NAMES[row.quality]}: ${ordinal(row.rank)} of ${row.of}`} />
              <span>
                {ordinal(row.rank)} of {row.of}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type Act = (change: Parameters<typeof teamAct>[0]) => void;

/** How full a level bar is: never quite empty, so the last on the grid still shows as a short red bar. */
const levelFill = (share: number): number => 0.08 + 0.92 * share;

function PartsCard({ career, open, act, onDetail }: { career: CareerState; open: boolean; act: Act; onDetail: (part: PartId) => void }) {
  const parts = partViews(career);
  const levels = partLevels(career);
  const money = moneyView(career)?.money ?? 0;
  return (
    <section class="parts-card" aria-labelledby="parts">
      <h2 class="visually-hidden" id="parts">
        Develop the car
      </h2>
      <ul class="part-tiles">
        {parts.map((part) => {
          const level = levels[part.part];
          return (
            <li class="part" key={part.part}>
              <button type="button" class="part__look" aria-label={`${PART_NAMES[part.part]}: what it does and what work on it gains`} onClick={() => onDetail(part.part)}>
                <PartArt part={part.part} class="part__art" />
                <span class="part__name">{PART_NAMES[part.part]}</span>
                <span class="part__bar">
                  <span class="part__label">Level</span>
                  <Meter
                    fill={levelFill(level?.share ?? 0)}
                    good={level?.share ?? 0}
                    size="small"
                    label={`${PART_NAMES[part.part]} level: ${level ? `${ordinal(level.rank)} of ${level.of}` : 'unknown'}`}
                  />
                </span>
                <span class="part__bar">
                  <span class="part__label">Reliability</span>
                  <Meter fill={part.soundness} size="small" label={`${PART_NAMES[part.part]} reliability`} class="part__meter" />
                </span>
              </button>
              {open && (
                <span class="part__actions">
                  <button
                    type="button"
                    class="button button--secondary"
                    disabled={money < part.upgradeCost}
                    onClick={() => act((outfit, ctx) => upgradePart(outfit, ctx, part.part))}
                  >
                    Upgrade · {cash(part.upgradeCost)}
                  </button>
                  {part.buildable && (
                    <button
                      type="button"
                      class="button button--secondary"
                      disabled={money < part.buildCost}
                      onClick={() => act((outfit, ctx) => buildPart(outfit, ctx, part.part))}
                    >
                      New version · {cash(part.buildCost)}
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p class="smallprint">Tap a part for what it does, and what work on it costs and gains.</p>
    </section>
  );
}

/** One part, in full: what it does, where it stands, and the two kinds of work on it. */
function PartSheet({ career, part, open, act, onClose }: { career: CareerState; part: PartId; open: boolean; act: Act; onClose: () => void }) {
  const view = partViews(career).find((entry) => entry.part === part) as PartView | undefined;
  const level = partLevels(career)[part];
  const money = moneyView(career)?.money ?? 0;
  const season = career.seasonYear;
  const supplier = career.outfit && career.team && !worksTeam(career.outfit, career.team) ? engineMakerName(career.outfit.engine) : null;
  if (!view) return null;
  const seconds = lapSeconds(part, view.gain, season);
  return (
    <Sheet title={PART_NAMES[part]} onClose={onClose}>
      <PartArt part={part} class="part__art part__art--large" />
      <p class="sheet__text">{partLine(part, season)}</p>
      <dl class="facts facts--tight">
        <div class="row row--meter">
          <dt class="row__label">Level</dt>
          <dd class="row__value row__value--meter">
            <Meter fill={levelFill(level?.share ?? 0)} good={level?.share ?? 0} size="small" label={`Level: ${level ? `${ordinal(level.rank)} of ${level.of}` : 'unknown'}`} />
            <span>{level ? `${ordinal(level.rank)} of ${level.of}` : 'Not known'}</span>
          </dd>
        </div>
        <div class="row row--meter">
          <dt class="row__label">Reliability</dt>
          <dd class="row__value row__value--meter">
            <Meter fill={view.soundness} size="small" label="Reliability" />
            <span>{view.soundness > 0.8 ? 'sound' : view.soundness > 0.5 ? 'fair' : 'fragile'}</span>
          </dd>
        </div>
      </dl>
      <p class="sheet__text">
        {view.locked === 'supplier'
          ? `Built by ${supplier}: it improves as theirs does. Upgrades fit it better to your car.`
          : view.locked === 'frozen'
            ? 'Frozen by the rules until 2014: upgrades only.'
            : `A new version: about ${seconds.toFixed(2)} s a lap quicker. ${view.builds} built this season.`}
      </p>
      <p class="sheet__text">
        An upgrade is cheap: a little pace, and reliability back. A new version costs more and gains much more, but is fragile at
        first, and each one this season costs 2 more than the last.
      </p>
      <div class="sheet__actions">
        {open && (
          <button
            type="button"
            class="button button--block button--secondary"
            disabled={money < view.upgradeCost}
            onClick={() => act((outfit, ctx) => upgradePart(outfit, ctx, part))}
          >
            Upgrade · {cash(view.upgradeCost)}
          </button>
        )}
        {open && view.buildable && (
          <button
            type="button"
            class="button button--block button--secondary"
            disabled={money < view.buildCost}
            onClick={() => act((outfit, ctx) => buildPart(outfit, ctx, part))}
          >
            New version · {cash(view.buildCost)}
          </button>
        )}
        <button type="button" class="button button--block button--quiet" onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  );
}

function NextYearCard({ career, open, act }: { career: CareerState; open: boolean; act: Act }) {
  const view = nextYearView(career);
  const money = moneyView(career)?.money ?? 0;
  if (!view) return null;
  return (
    <section class="card" aria-labelledby="next-year">
      <h2 class="card__title" id="next-year">
        The {view.season} car
      </h2>
      <p class="muted">
        {view.major
          ? `The rules change a lot in ${view.season}. This year's parts will mostly be thrown away, so work on the new car counts for far more than usual.`
          : `Some of this year's progress carries over to next year's car; money put in now makes it better still.`}
      </p>
      <dl class="facts facts--tight">
        <div class="row row--meter">
          <dt class="row__label">Put in so far</dt>
          <dd class="row__value row__value--meter">
            <Meter
              fill={view.invested / Math.max(1, view.usual * 2)}
              good={Math.min(1, view.invested / Math.max(1, view.usual))}
              size="small"
              label={`${cash(view.invested)} put into the ${view.season} car`}
            />
            <span class="figure">{cash(view.invested)}</span>
          </dd>
        </div>
      </dl>
      <p class="muted">A team with your money usually puts about {cash(view.usual)} in over the season.</p>
      {open && (
        <span class="part__actions">
          {[5, 10].map((amount) => (
            <button
              type="button"
              key={amount}
              class="button button--secondary"
              disabled={money < amount}
              onClick={() => act((outfit, ctx) => investNextYear(outfit, ctx, amount))}
            >
              Put in {amount}
            </button>
          ))}
        </span>
      )}
    </section>
  );
}

function UnitsCard({ career, open, act }: { career: CareerState; open: boolean; act: Act }) {
  const units = unitViews(career);
  if (units.length === 0) return null;
  return (
    <section class="card" aria-labelledby="power-units">
      <h2 class="card__title" id="power-units">
        Power units
      </h2>
      <p class="muted">
        Each car may use {units[0]!.engineAllowance} engines this season
        {units[0]!.batteryAllowance !== null ? ` and ${units[0]!.batteryAllowance} batteries` : ''}. A worn one is replaced
        before the next race; going past the allowance costs grid places. Worn units break down more often.
      </p>
      <ul class="units">
        {units.map((unit) => (
          <li class="unit" key={unit.seat}>
            <span class="unit__name">{driverName(unit.driver)}</span>
            <span class="unit__row">
              <span class="unit__label">
                Engine {unit.engines} of {unit.engineAllowance}
              </span>
              <Meter fill={1 - unit.engineWorn} size="small" label={`Engine life left: ${Math.round((1 - unit.engineWorn) * 100)} percent`} />
            </span>
            {unit.batteryAllowance !== null && (
              <span class="unit__row">
                <span class="unit__label">
                  Battery {unit.batteries} of {unit.batteryAllowance}
                </span>
                <Meter fill={1 - unit.batteryWorn} size="small" label="Battery life left" />
              </span>
            )}
            {unit.penalty > 0 && <span class="unit__warning">{unit.penalty} places back on the grid at the next race.</span>}
            {open && (
              <span class="part__actions">
                <button type="button" class="button button--secondary" onClick={() => act((outfit, ctx) => fitUnit(outfit, ctx, unit.seat, 'engine'))}>
                  New engine{unit.nextEnginePenalty > 0 ? ` (${unit.nextEnginePenalty} places)` : ''}
                </button>
                {unit.batteryAllowance !== null && (
                  <button type="button" class="button button--secondary" onClick={() => act((outfit, ctx) => fitUnit(outfit, ctx, unit.seat, 'battery'))}>
                    New battery{unit.nextBatteryPenalty > 0 ? ` (${unit.nextBatteryPenalty} places)` : ''}
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
