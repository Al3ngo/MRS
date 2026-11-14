import { useEffect } from 'preact/hooks';
import { useErrorBoundary } from 'preact/hooks';
import { route } from '../app/router';
import { calendar } from '../game/data';
import { useStore } from '../app/store';
import { AlmanacScreen } from './screens/AlmanacScreen';
import { CareerScreen } from './screens/CareerScreen';
import { CareersScreen } from './screens/CareersScreen';
import { RaceBenchScreen } from './screens/RaceBenchScreen';
import { SystemScreen } from './screens/SystemScreen';
import { Toasts } from './Toasts';

export function App() {
  const current = useStore(route);
  const [crash] = useErrorBoundary();

  // Each screen starts at its top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [current.screen]);

  if (crash) return <Crash error={crash} />;

  return (
    <>
      {current.screen === 'careers' && <CareersScreen />}
      {current.screen === 'career' && <CareerScreen key={current.slot} slot={current.slot} />}
      {current.screen === 'almanac' && <AlmanacScreen season={current.season} />}
      {current.screen === 'bench' && (
        <RaceBenchScreen
          key={`${current.season}-${current.round}`}
          season={current.season}
          round={calendar(current.season)[current.round - 1]!}
        />
      )}
      {current.screen === 'system' && <SystemScreen />}
      <Toasts aboveBar={current.screen === 'career' || current.screen === 'bench'} />
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
