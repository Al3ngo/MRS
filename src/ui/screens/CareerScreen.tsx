import { useEffect } from 'preact/hooks';
import { goBack } from '../../app/router';
import { app, autosave, completeNextSession, enterCareer, leaveCareer } from '../../app/session';
import { useStore } from '../../app/store';
import { WEEKEND_PHASES, roundsIn } from '../../game/career';
import type { SlotId } from '../../platform/saves';
import { formatBytes, formatClock, PHASE_NAMES } from '../format';
import { IconBack } from '../icons';

/**
 * STAGE 1 TEST BENCH. This screen stands in for the game until the season loop is built (Stage 5).
 * Its sessions do nothing but move the career on one step, and that is the point: each step goes
 * through the real autosave, so slots, saves, backups and offline play can all be tried by hand.
 */
export function CareerScreen({ slot }: { slot: SlotId }) {
  const { active } = useStore(app);

  useEffect(() => {
    void enterCareer(slot);
    return () => {
      void leaveCareer();
    };
  }, [slot]);

  const mine = active?.slot === slot ? active : null;
  const career = mine?.career;
  const record = mine?.record ?? null;

  const saveLine = !mine
    ? ''
    : mine.saveError
      ? 'Not saved'
      : mine.pendingSaves > 0
        ? 'Saving'
        : record
          ? `Saved ${formatClock(record.savedAt)}`
          : '';

  return (
    <div class="shell">
      <header class="topbar">
        <div class="topbar__inner">
          <button type="button" class="back" onClick={() => goBack({ screen: 'careers' })}>
            <IconBack />
            Careers
          </button>
          <span class="topbar__meta" aria-live="polite">
            {saveLine}
          </span>
        </div>
      </header>

      <main class={`canvas${career && !career.finished ? ' canvas--above-bar' : ''}`}>
        {career && (
          <>
            <div class="title-row">
              <h1 class="title">Season {career.seasonYear}</h1>
              <p class="subtitle">
                {career.finished
                  ? `Career complete · Slot ${slot}`
                  : `Round ${career.round} of ${roundsIn(career.seasonYear)} · Slot ${slot}`}
              </p>
            </div>

            <div class="bench">
              <p class="notice bench__notice">
                Stage 1 test bench. The sessions below are stand-ins until the race engine is built; completing one
                writes a real autosave.
              </p>

              {mine?.saveError && (
                <div class="notice notice--problem bench__notice bench__retry">
                  <p class="selectable">{mine.saveError}</p>
                  <button type="button" class="button button--secondary" onClick={() => void autosave()}>
                    Save again
                  </button>
                </div>
              )}

              <section class="card" aria-labelledby="bench-round">
                <h2 class="card__title" id="bench-round">
                  {career.finished ? 'The last round' : 'This round'}
                </h2>
                {career.finished ? (
                  <p class="muted bench__done">
                    The 2026 season was the last. The end-of-career summary arrives with the season loop.
                  </p>
                ) : (
                  <ol class="bench__rows">
                    {WEEKEND_PHASES.map((phase, index) => {
                      const at = WEEKEND_PHASES.indexOf(career.phase);
                      const state = index < at ? 'done' : index === at ? 'next' : 'later';
                      return (
                        <li key={phase} class={`row row--${state}`}>
                          <span class="row__label">{PHASE_NAMES[phase]}</span>
                          <span class="row__value">{state === 'done' ? 'Done' : state === 'next' ? 'Next' : ''}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              <section class="card" aria-labelledby="bench-save">
                <h2 class="card__title" id="bench-save">
                  Autosave
                </h2>
                <dl class="facts">
                  <div class="row">
                    <dt class="row__label">Sessions completed</dt>
                    <dd class="row__value">{career.sessionsCompleted}</dd>
                  </div>
                  <div class="row">
                    <dt class="row__label">Save size</dt>
                    <dd class="row__value">{record ? formatBytes(record.bytes) : '—'}</dd>
                  </div>
                  <div class="row">
                    <dt class="row__label">Safety copy</dt>
                    <dd class="row__value">{record?.hasSafetyCopy ? 'Kept' : 'None yet'}</dd>
                  </div>
                </dl>
              </section>
            </div>
          </>
        )}
      </main>

      {career && !career.finished && (
        <div class="actionbar">
          <div class="actionbar__inner">
            <button type="button" class="button button--primary" onClick={() => void completeNextSession()}>
              Complete {PHASE_NAMES[career.phase].toLowerCase()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
