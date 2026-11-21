import { useEffect } from 'preact/hooks';
import { useErrorBoundary } from 'preact/hooks';
import { route } from '../app/router';
import { calendar } from '../game/data';
import { useStore } from '../app/store';
import { AlmanacScreen } from './screens/AlmanacScreen';
import { CareerScreen } from './screens/CareerScreen';
import { CareersScreen } from './screens/CareersScreen';
import { RaceScreen } from './screens/RaceScreen';
import { SystemScreen } from './screens/SystemScreen';
import { WeekendScreen } from './screens/WeekendScreen';
import { MotionPrompt } from './MotionPrompt';
import { Toasts } from './Toasts';
import { scrollStageTo } from './stage';

export function App() {
  const current = useStore(route);
  const [crash] = useErrorBoundary();

  // Each screen starts at its top.
  useEffect(() => {
    scrollStageTo(0);
  }, [current.screen]);

  if (crash)
    return (
      <div class="scroller">
        <Crash error={crash} />
      </div>
    );

  // Screens scroll inside the stage, never the page: see stage.ts.
  return (
    <>
      <div class="scroller">
      {current.screen === 'careers' && <CareersScreen />}
      {current.screen === 'career' && <CareerScreen key={current.slot} slot={current.slot} />}
      {current.screen === 'weekend' && <WeekendScreen key={current.slot} slot={current.slot} />}
      {current.screen === 'almanac' && <AlmanacScreen season={current.season} />}
      {current.screen === 'race' && (
        <RaceScreen
          key={`${current.season}-${current.round}`}
          season={current.season}
          round={calendar(current.season)[current.round - 1]!}
        />
      )}
      {current.screen === 'system' && <SystemScreen />}
      </div>
      <MotionPrompt />
      <Toasts aboveBar={current.screen === 'career' || current.screen === 'weekend' || current.screen === 'race'} />
    </>
  );
}

/** Shown if a screen throws while drawing. Saves are written as play goes, so nothing is at risk. */
function Crash({ error }: { error: unknown }) {
  return (
    <div class="shell">
      <main class="canvas">
        <div class="title-row">
          <h1 class="title">Something broke</h1>
          <p class="subtitle">Your careers are safe: they were saved as you played.</p>
        </div>
        <div class="card stack">
          <p class="muted selectable">{error instanceof Error ? error.message : String(error)}</p>
          <div>
            <button type="button" class="button button--primary" onClick={() => window.location.reload()}>
              Reload the game
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
