import { useState } from 'preact/hooks';
import type { CareerState } from '../../game/career';
import { driver as driverById, isFictional } from '../../game/data';
import { canDevelop } from '../../game/season/business';
import { ACADEMY_PLACES, academyFee, academyProspects, heldBy, releaseJunior, signJunior } from '../../game/team';
import { careerStage, potentialOf, raceAge, standing, type CareerStage, type LostDriver } from '../../game/world';
import { Meter } from '../Meter';
import { Sheet } from '../Sheet';
import { teamAct } from './Business';
import { cash } from './businessWords';
import { driverName, teamLabel } from './names';

/**
 * The driver lifecycle on screen: the news of a fatal accident, the drivers remembered, and the
 * junior academy.
 */

export const STAGE_WORDS: Readonly<Record<CareerStage, string>> = {
  improving: 'Still improving',
  peak: 'At their best',
  fading: 'Past their best',
  final: 'Final season',
};

/** Shown once, after a race in which a driver was lost. Golden Lap has one choice here; so does this. */
export function TragedySheet({ lost, career, onClose }: { lost: readonly LostDriver[]; career: CareerState; onClose: () => void }) {
  const ours = lost.some((entry) => entry.team === career.team);
  return (
    <Sheet title="A tragedy" onClose={onClose}>
      {lost.map((entry) => (
        <p class="tragedy" key={entry.driver}>
          {driverName(entry.driver)} of {teamLabel(entry.team, entry.season).name} died after a crash on lap {entry.lap} of the{' '}
          {entry.season} {entry.race}.
        </p>
      ))}
      <p class="muted">
        {ours
          ? 'Your team must sign a driver before the next race. The sport goes on, and remembers.'
          : 'The team will run another driver from the next race. The sport goes on, and remembers.'}
      </p>
      <div class="sheet__actions">
        <button type="button" class="button button--block button--secondary" onClick={onClose}>
          Continue
        </button>
      </div>
    </Sheet>
  );
}

/** The drivers lost in this career. */
export function MemorialCard({ career }: { career: CareerState }) {
  const lost = career.world.lost;
  if (lost.length === 0) return null;
  return (
    <section class="card" aria-labelledby="remembered">
      <h2 class="card__title" id="remembered">
        Remembered
      </h2>
      <ul class="people">
        {lost.map((entry) => (
          <li class="person" key={entry.driver}>
            <span class="person__name">{driverName(entry.driver)}</span>
            <span class="person__detail">
              {teamLabel(entry.team, entry.season).name} · {entry.season} {entry.race}, lap {entry.lap}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const DRIVER_SCALE = (overall: number): number => (overall - 55) / 45;

/** The junior academy: up to three young drivers, growing up. */
export function AcademyCard({ career }: { career: CareerState }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const outfit = career.outfit;
  if (!outfit) return null;
  const season = career.seasonYear;
  const working = canDevelop(career) || (career.outfit?.preseason.length ?? 0) > 0;
  return (
    <section class="card" aria-labelledby="academy">
      <h2 class="card__title" id="academy">
        Junior academy
      </h2>
      <p class="muted">
        Young drivers grow into their talent as they get older; each full season here adds a point to every rating once they
        race for you. Old enough ({raceAge(season + 1)} next season), they can be signed to a race seat between seasons.
      </p>
      {outfit.academy.length > 0 && (
        <ul class="people">
          {outfit.academy.map((junior) => {
            const now = standing(junior.driver, season);
            const ready = now !== undefined && now.age + 1 >= raceAge(season + 1);
            return (
              <li class="person" key={junior.driver}>
                <span class="person__name">
                  {driverName(junior.driver)}, {now?.age}
                </span>
                <span class="junior__bars">
                  <span class="junior__label">Now</span>
                  <Meter fill={DRIVER_SCALE(now?.overall ?? 55)} size="small" label={`${driverName(junior.driver)} now: ${now?.overall}`} />
                  <span class="junior__label">Potential</span>
                  <Meter fill={DRIVER_SCALE(potentialOf(junior.driver))} size="small" label={`${driverName(junior.driver)}'s potential`} />
                </span>
                <span class="person__detail">
                  {driverById(junior.driver).nationality} · {cash(junior.fee)} a season · {ready ? 'can race next season' : 'still too young to race'}
                </span>
                {working && (
                  <span class="person__actions">
                    <button type="button" class="button button--quiet" onClick={() => setMessage(teamAct((current) => releaseJunior(current, junior.driver)))}>
                      Let go
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {message && <p class="notice">{message}</p>}
      {working && outfit.academy.length < ACADEMY_PLACES && (
        <button type="button" class="button button--secondary button--block money__books" onClick={() => setOpen(true)}>
          Sign a junior ({ACADEMY_PLACES - outfit.academy.length} {ACADEMY_PLACES - outfit.academy.length === 1 ? 'place' : 'places'} left)
        </button>
      )}
      {open && <ProspectsSheet career={career} close={() => setOpen(false)} />}
    </section>
  );
}

function ProspectsSheet({ career, close }: { career: CareerState; close: () => void }) {
  const outfit = career.outfit!;
  const season = career.seasonYear;
  const list = academyProspects(outfit, career.world, season).slice(0, 12);
  return (
    <Sheet title="Young drivers" onClose={close}>
      <p class="muted">
        The best young drivers not yet racing, aged 15 to 19: the junior series' brightest, and real drivers before their first
        race. The bars show how good they are now, and how good they could become.
      </p>
      <div class="choices">
        {list.map((entry) => {
          const id = entry.driver.id;
          return (
            <button
              type="button"
              class="choice"
              key={id}
              onClick={() => {
                teamAct((current, ctx) => signJunior(current, career.world, ctx.season, id));
                close();
              }}
            >
              <span class="choice__name">
                <span>
                  {entry.driver.name}, {entry.age}
                </span>
                <span class="choice__bars">
                  <span class="choice__detail">Now</span>
                  <Meter fill={DRIVER_SCALE(entry.overall)} size="small" label={`${entry.driver.name} now`} />
                  <span class="choice__detail">Potential</span>
                  <Meter fill={DRIVER_SCALE(potentialOf(id))} size="small" label={`${entry.driver.name}'s potential`} />
                </span>
                <span class="choice__detail">
                  {entry.driver.nationality}
                  {!isFictional(id) ? ` · in reality, first race in ${entry.driver.debut}` : ''}
                </span>
              </span>
              <span class="choice__note figure">{cash(academyFee(id))}</span>
            </button>
          );
        })}
      </div>
      <p class="muted">Fee a season, paid race by race.</p>
    </Sheet>
  );
}

/** A driver's career stage, in words, for a list. */
export const stageOf = (career: CareerState, driver: string): string =>
  STAGE_WORDS[careerStage(driver, career.seasonYear, heldBy(career.outfit, career.seasonYear + 1))];
