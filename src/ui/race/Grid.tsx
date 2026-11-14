import { useMemo, useState } from 'preact/hooks';
import { command, options, type CarState, type RaceState } from '../../game/sim';
import { Sheet } from '../Sheet';
import { placeWords } from './words';

const tyreName = (state: RaceState, id: string): string => state.setup.compounds.find((tyre) => tyre.id === id)!.name;

function planWords(state: RaceState, car: CarState): string {
  const start = `Start on ${tyreName(state, car.tyre).toLowerCase()}`;
  if (car.plan.length === 0) return `${start}. No stop planned.`;
  return `${start}, then ${car.plan.map((stop) => `${tyreName(state, stop.compound).toLowerCase()} on lap ${stop.lap}`).join(', ')}.`;
}

/** The starting grid, with the player's plan for each car and the chance to change it. */
export function Grid({ state, onChange }: { state: RaceState; onChange: () => void }) {
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
                  {grid[car.entrant]!.driverName}, starts {placeWords(car.entrant + 1)}
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
              ? 'Planned stops are made for you. During the race you can stop sooner, pick other tyres, or change the plan.'
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
        The quickest ways to run {setup.laps} laps here, as the team works it out. Each shows the time it would lose against the quickest plan.
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
                    : choice.stops.length === 1
                      ? `One stop, on lap ${choice.stops[0]!.after}`
                      : `${choice.stops.length} stops, on laps ${choice.stops.map((stop) => stop.after).join(' and ')}`}
                </span>
              </span>
              <span class="figure choice__note">
                {choice.cost - best < 0.05 ? 'Quickest' : `+${(choice.cost - best).toFixed(1)}s`}
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
