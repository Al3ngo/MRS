import { useMemo, useState } from 'preact/hooks';
import { goBack } from '../../app/router';
import type { RoundFact } from '../../game/data';
import {
  command,
  options,
  quickRace,
  realEntrants,
  seedFrom,
  type CarState,
  type Entrant,
  type RaceState,
} from '../../game/sim';
import { formatLap } from '../format';
import { IconBack } from '../icons';
import { LiveRace } from '../race/LiveRace';
import { RaceResult, ordinal, poleOf, type Pole } from '../race/Result';
import { trackWords } from '../race/words';
import { Sheet } from '../Sheet';

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
            <p class="subtitle">Choose the team to run. Its two cars are yours for the race.</p>
          </div>
          <TeamList
            season={season}
            round={round.round}
            onPick={(picked) => {
              setTeam(picked);
              setStep('grid');
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
                {prepared.state.setup.laps} laps. Track: {trackWords(prepared.state.wetness).toLowerCase()}. Pole:{' '}
                {prepared.state.setup.grid[0]!.driverName}, {formatLap(prepared.pole.time)}.
              </p>
            </div>
            <Grid prepared={prepared} onChange={() => setBeat((beat) => beat + 1)} />
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
                  window.scrollTo(0, 0);
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
      const name = grid[car.entrant]!.driverName.split(' ').at(-1);
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
    <section class="card card--list" aria-label="Teams">
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
              <span class="round__where">Every car is run by its own pit wall</span>
            </span>
          </button>
        </li>
      </ul>
    </section>
  );
}

const tyreName = (state: RaceState, id: string): string => state.setup.compounds.find((tyre) => tyre.id === id)!.name;

function planWords(state: RaceState, car: CarState): string {
  const start = `Start on ${tyreName(state, car.tyre).toLowerCase()}`;
  if (car.plan.length === 0) return `${start}. No stop planned.`;
  return `${start}, then ${car.plan.map((stop) => `${tyreName(state, stop.compound).toLowerCase()} on lap ${stop.lap}`).join(', ')}.`;
}

function Grid({ prepared, onChange }: { prepared: Prepared; onChange: () => void }) {
  const { state } = prepared;
  const { grid } = state.setup;
  const mine = state.cars.filter((car) => grid[car.entrant]!.player);
  const [planning, setPlanning] = useState<CarState | null>(null);
  const dryStart = state.setup.compounds.find((tyre) => tyre.id === state.cars[0]!.tyre)!.kind === 'dry';

  return (
    <>
      {mine.length > 0 && (
        <section class="card stack" aria-labelledby="grid-plan">
          <h2 class="card__title" id="grid-plan">
            Your plan
          </h2>
          {mine.map((car) => (
            <div class="plan" key={car.id}>
              <span class="round__text">
                <span class="round__name">
                  {grid[car.entrant]!.driverName}, {ordinal(car.entrant + 1)} on the grid
                </span>
                <span class="plan__words">{planWords(state, car)}</span>
              </span>
              {dryStart && (
                <button type="button" class="button button--secondary" onClick={() => setPlanning(car)}>
                  Change
                </button>
              )}
            </div>
          ))}
          <p class="muted">
            {dryStart
              ? 'Planned stops are made for you. In the race you can stop sooner, change tyres or change your mind.'
              : 'The track is wet, so the cars start on wet-weather tyres. When to stop is yours to call.'}
          </p>
        </section>
      )}

      <section class={`card card--list${mine.length > 0 ? ' card--gap' : ''}`} aria-label="Starting grid">
        <ol>
          {grid.map((entrant, index) => (
            <li key={entrant.id}>
              <div class={`result${entrant.player ? ' result--mine' : ''}`}>
                <span class="figure result__place">{index + 1}</span>
                <span class="team__colour" style={{ background: entrant.colour }} />
                <span class="round__text">
                  <span class="round__name">{entrant.driverName}</span>
                  <span class="round__where">{entrant.teamName}</span>
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {planning && (
        <PlanSheet
          state={state}
          car={planning}
          onClose={() => {
            setPlanning(null);
            onChange();
          }}
        />
      )}
    </>
  );
}

/** The quickest few ways to run the race, to choose between. */
function PlanSheet({ state, car, onClose }: { state: RaceState; car: CarState; onClose: () => void }) {
  const { setup } = state;
  const entrant = setup.grid[car.entrant]!;
  const choices = useMemo(() => {
    const all = options(setup, entrant, setup.laps, {
      current: null,
      used: [],
      ruleApplies: setup.rules.twoCompoundRule,
      maxStops: 3,
      stopCost: setup.traits.pitLoss + 1,
    });
    return all.slice(0, 6);
  }, [setup, entrant]);
  const best = choices[0]?.cost ?? 0;
  const current = [car.tyre, ...car.plan.map((stop) => `${stop.lap}:${stop.compound}`)].join('|');

  return (
    <Sheet title={`Plan: ${entrant.driverName}`} onClose={onClose}>
      <p class="sheet__text">
        The quickest ways to run {setup.laps} laps here, by the pit wall's sums. Times are against the quickest.
      </p>
      <div class="choices" role="radiogroup" aria-label="Race plan">
        {choices.map((choice) => {
          const key = [choice.first, ...choice.stops.map((stop) => `${stop.after}:${stop.compound}`)].join('|');
          const names = [choice.first, ...choice.stops.map((stop) => stop.compound)].map((id) => tyreName(state, id));
          return (
            <button
              type="button"
              key={key}
              role="radio"
              aria-checked={key === current}
              class={`choice${key === current ? ' choice--on' : ''}`}
              onClick={() => {
                command(state, {
                  type: 'plan',
                  car: car.id,
                  start: choice.first,
                  stops: choice.stops.map((stop) => ({ lap: stop.after, compound: stop.compound })),
                });
                onClose();
              }}
            >
              <span class="choice__name">
                {names.join(', then ')}
                <span class="choice__detail">
                  {choice.stops.length === 0
                    ? 'No stop'
                    : `Stop on lap ${choice.stops.map((stop) => stop.after).join(' and ')}`}
                </span>
              </span>
              <span class="figure choice__note">
                {choice.cost - best < 0.05 ? 'Quickest' : `+${(choice.cost - best).toFixed(1)} s`}
              </span>
            </button>
          );
        })}
      </div>
      <div class="sheet__actions">
        <button type="button" class="button button--block button--secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  );
}
