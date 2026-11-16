import { useMemo, useState } from 'preact/hooks';
import { goBack } from '../../app/router';
import { driver as driverById, type RoundFact } from '../../game/data';
import {
  quickRace,
  realEntrants,
  seedFrom,
  type Entrant,
  type RaceState,
} from '../../game/sim';
import { formatLap } from '../format';
import { IconBack } from '../icons';
import { Grid } from '../race/Grid';
import { LiveRace } from '../race/LiveRace';
import { RaceResult, ordinal, poleOf, type Pole } from '../race/Result';
import { TrackReading } from '../race/TrackReading';
import { scrollStageTo } from '../stage';

/**
 * A race at a real round: choose a team (or none, to watch), look over the grid and the plan, run
 * the race, read the result. Until the season loop of Stage 5 this is how a race is reached.
 */

interface Prepared {
  state: RaceState;
  pole: Pole;
}

type Step = 'team' | 'grid' | 'live' | 'result';

export function RaceScreen({ season, round }: { season: number; round: RoundFact }) {
  const [step, setStep] = useState<Step>('team');
  const [team, setTeam] = useState<string | null>(null);
  const [run, setRun] = useState(1);
  const [, setBeat] = useState(0);

  // Qualifying is run, and the race made ready, once the team is known. Each run is its own race.
  const prepared = useMemo<Prepared | null>(() => {
    if (step === 'team') return null;
    const { qualifying, race } = quickRace(season, round.round, seedFrom('race', season, round.round, run), team ?? undefined);
    return { state: race, pole: poleOf(qualifying, race) };
  }, [season, round.round, run, team, step === 'team']);

  const leave = (): void => goBack({ screen: 'almanac', season });
  const title = `${season} ${round.name}`;

  if (step === 'live' && prepared) {
    return <LiveRace state={prepared.state} onFinish={() => setStep('result')} onLeave={leave} />;
  }

  return (
    <div class="shell">
      <header class="topbar">
        <div class="topbar__inner">
          <button type="button" class="back" onClick={leave}>
            <IconBack />
            Almanac
          </button>
          <span class="topbar__meta">{step === 'result' ? 'Result' : 'Race'}</span>
        </div>
      </header>

      {step === 'team' && (
        <main class="canvas">
          <div class="title-row">
            <h1 class="title">{title}</h1>
            <p class="subtitle">Choose the team to run. Its two cars are yours to manage for the race.</p>
          </div>
          <TeamList
            season={season}
            round={round.round}
            onPick={(picked) => {
              setTeam(picked);
              setStep('grid');
              scrollStageTo(0);
            }}
          />
        </main>
      )}

      {step === 'grid' && prepared && (
        <>
          <main class="canvas canvas--above-bar">
            <div class="title-row">
              <h1 class="title">{title}</h1>
              <p class="subtitle">
                {prepared.state.setup.laps} laps. <TrackReading wetness={prepared.state.wetness} /> Starting first:{' '}
                {prepared.state.setup.grid[0]!.driverName}, fastest in qualifying ({formatLap(prepared.pole.time ?? 0)}).
              </p>
            </div>
            <Grid state={prepared.state} onChange={() => setBeat((beat) => beat + 1)} />
          </main>
          <div class="actionbar">
            <div class="actionbar__inner">
              <button type="button" class="button button--primary" onClick={() => setStep('live')}>
                Start the race
              </button>
            </div>
          </div>
        </>
      )}

      {step === 'result' && prepared && (
        <>
          <main class="canvas canvas--above-bar">
            <div class="title-row">
              <h1 class="title">{title}</h1>
              <p class="subtitle">{resultLine(prepared.state)}</p>
            </div>
            <RaceResult state={prepared.state} pole={prepared.pole} title={`Race ${run}`} />
          </main>
          <div class="actionbar">
            <div class="actionbar__inner">
              <button
                type="button"
                class="button button--primary"
                onClick={() => {
                  setRun(run + 1);
                  setStep('grid');
                  scrollStageTo(0);
                }}
              >
                Race it again
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** One line on how the player's cars did, or who won. */
function resultLine(state: RaceState): string {
  const { grid } = state.setup;
  const mine = state.cars.filter((car) => grid[car.entrant]!.player);
  if (mine.length === 0) {
    const winner = state.cars.find((car) => car.position === 1)!;
    return `${grid[winner.entrant]!.driverName} wins for ${grid[winner.entrant]!.teamName}.`;
  }
  return mine
    .map((car) => {
      const name = driverById(grid[car.entrant]!.driver).lastName;
      return car.status === 'out' ? `${name} retired` : `${name} finished ${ordinal(car.position)}`;
    })
    .join(', ')
    .concat('.');
}

function TeamList({ season, round, onPick }: { season: number; round: number; onPick: (team: string | null) => void }) {
  const teams = useMemo(() => {
    const byTeam = new Map<string, Entrant[]>();
    for (const entrant of realEntrants(season, round)) {
      byTeam.set(entrant.team, [...(byTeam.get(entrant.team) ?? []), entrant]);
    }
    return [...byTeam.values()];
  }, [season, round]);
  return (
    <section class="card card--list card--columns" aria-label="Teams">
      <ul>
        {teams.map((cars) => (
          <li key={cars[0]!.team}>
            <button type="button" class="driver" onClick={() => onPick(cars[0]!.team)}>
              <span class="team__colour" style={{ background: cars[0]!.colour }} />
              <span class="round__text">
                <span class="round__name">{cars[0]!.teamName}</span>
                <span class="round__where">{cars.map((car) => car.driverName).join(', ')}</span>
              </span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" class="driver" onClick={() => onPick(null)}>
            <span class="round__text">
              <span class="round__name">Watch without a team</span>
              <span class="round__where">Every team makes its own calls; you just watch</span>
            </span>
          </button>
        </li>
      </ul>
    </section>
  );
}

