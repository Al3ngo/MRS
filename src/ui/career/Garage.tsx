import { useState } from 'preact/hooks';
import type { CareerState } from '../../game/career';
import {
  canDevelop,
  carAgainstField,
  lapSeconds,
  moneyView,
  nextYearView,
  partViews,
  unitViews,
} from '../../game/season/business';
import { buildPart, fitUnit, investNextYear, upgradePart, worksTeam, type PartId } from '../../game/team';
import { Meter } from '../Meter';
import { ordinal } from '../race/Result';
import { teamAct } from './Business';
import { PART_NAMES, QUALITY_LINES, QUALITY_NAMES, cash, engineMakerName, partLine } from './businessWords';
import { driverName } from './names';

/**
 * The car: how it compares with the field, its parts (upgrade, or build a new version), next
 * year's car, and the power units against the season's allowance. Work is done between races.
 */
export function Garage({ career }: { career: CareerState }) {
  const [message, setMessage] = useState<string | null>(null);
  const open = canDevelop(career);
  const act = (change: Parameters<typeof teamAct>[0]): void => setMessage(teamAct(change));
  return (
    <div class="stack">
      <FieldCard career={career} />
      {!open && <p class="muted">The car can be worked on between races.</p>}
      {message && (
        <p class="notice" role="status">
          {message}
        </p>
      )}
      <PartsCard career={career} open={open} act={act} />
      <NextYearCard career={career} open={open} act={act} />
      <UnitsCard career={career} open={open} act={act} />
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

function PartsCard({ career, open, act }: { career: CareerState; open: boolean; act: Act }) {
  const parts = partViews(career);
  const money = moneyView(career)?.money ?? 0;
  const season = career.seasonYear;
  const supplier = career.outfit && career.team && !worksTeam(career.outfit, career.team) ? engineMakerName(career.outfit.engine) : null;
  return (
    <section class="card" aria-labelledby="parts">
      <h2 class="card__title" id="parts">
        Develop the car
      </h2>
      <p class="muted">
        An upgrade is cheap: a little pace, and reliability back. A new version costs more and gains much more, but is
        fragile at first, and each one this season costs 2 more than the last.
      </p>
      <ul class="parts">
        {parts.map((part) => {
          const seconds = lapSeconds(part.part as PartId, part.gain, season);
          return (
            <li class="part" key={part.part}>
              <span class="part__head">
                <span class="part__name">{PART_NAMES[part.part]}</span>
                <Meter fill={part.soundness} size="small" label={`${PART_NAMES[part.part]} reliability`} class="part__meter" />
              </span>
              <span class="part__line">{partLine(part.part, season)}</span>
              <span class="part__line">
                {part.locked === 'supplier'
                  ? `Built by ${supplier}: it improves as theirs does. Upgrades fit it better to your car.`
                  : part.locked === 'frozen'
                    ? 'Frozen by the rules until 2014: upgrades only.'
                    : `A new version: about ${seconds.toFixed(2)} s a lap quicker. ${part.builds} built this season.`}
              </span>
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
      <p class="muted">The bar beside each part is its reliability: new parts lower it, upgrades bring it back.</p>
    </section>
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
