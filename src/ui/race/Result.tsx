import { driver as driverById } from '../../game/data';
import {
  DRY_LIMIT,
  classification,
  raceStats,
  type QualifyingState,
  type RaceState,
  type ResultRow,
} from '../../game/sim';
import { formatGap, formatLap, formatRaceTime } from '../format';
import { causeLabel, causePhrase } from './words';

/** What a finished race is shown as: its numbers, its result and its turning points. */

export interface Pole {
  driver: string;
  /** Null when the grid was set by a sprint, not a lap. */
  time: number | null;
  wet: boolean;
}

/** Who took pole, from a finished qualifying session. */
export function poleOf(qualifying: QualifyingState, state: RaceState): Pole {
  const best = qualifying.parts[2]!.laps[0]!;
  const entrant = state.setup.grid.find((candidate) => candidate.id === best.car)!;
  return { driver: entrant.driver, time: best.time, wet: qualifying.parts[2]!.wetness > DRY_LIMIT };
}

interface Outcome {
  state: RaceState;
  rows: ResultRow[];
  pole: Pole;
}

export const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;
const ORDINALS = ['th', 'st', 'nd', 'rd'];
export const ordinal = (place: number): string =>
  `${place}${place % 100 >= 11 && place % 100 <= 13 ? 'th' : (ORDINALS[place % 10] ?? 'th')}`;

function summary({ state, rows, pole }: Outcome): [string, string][] {
  const { setup } = state;
  const stats = raceStats(state);

  let weather = 'Dry';
  if (stats.wet) weather = stats.wetFromStart ? 'Wet from the start' : `Rain from lap ${stats.rainFromLap}`;
  else if (stats.rainFromLap !== null) weather = `A shower on lap ${stats.rainFromLap}`;

  const cautions = [
    stats.safetyCars > 0 ? plural(stats.safetyCars, 'safety car') : '',
    stats.virtualSafetyCars > 0 ? plural(stats.virtualSafetyCars, 'virtual safety car') : '',
    stats.redFlags > 0 ? plural(stats.redFlags, 'red flag') : '',
  ].filter(Boolean);

  const winner = rows[0]!;
  const facts: [string, string][] = [
    [
      'Started first',
      pole.time === null
        ? `${driverById(pole.driver).lastName}, as sprint winner`
        : `${driverById(pole.driver).lastName}, ${formatLap(pole.time)} in qualifying${pole.wet ? ' (wet)' : ''}`,
    ],
    ['Race time', winner.time !== null ? formatRaceTime(winner.time) : `${winner.laps} laps`],
    ['Weather', weather],
    ['Safety car', cautions.join(', ') || 'None'],
    [
      'Overtakes',
      stats.overtakesOnTrouble > 0
        ? `${stats.overtakes}, plus ${stats.overtakesOnTrouble} past a car in trouble`
        : `${stats.overtakes}`,
    ],
    ['Pit stops', `${stats.pitStops} in all, on ${stats.dryTypes.join(', ').toLowerCase()} tyres`],
  ];
  if (state.fastestLap) {
    const holder = setup.grid.find((entrant) => entrant.id === state.fastestLap!.car)!;
    facts.push([
      'Fastest lap',
      `${driverById(holder.driver).lastName}, ${formatLap(state.fastestLap.lapTime)} on lap ${state.fastestLap.lap}`,
    ]);
  }
  if (state.abandoned) facts.push(['Ended', `Stopped for good after ${winner.laps} of ${setup.laps} laps`]);
  else if (state.endedEarly) facts.push(['Ended', `Two-hour limit, after ${winner.laps} of ${setup.laps} laps`]);
  return facts;
}

/** The moments that shaped the race, in order. */
function story(state: RaceState): { lap: number; text: string }[] {
  const name = (car: string): string => driverById(state.setup.grid.find((entrant) => entrant.id === car)!.driver).lastName;
  const lines: { lap: number; text: string }[] = [];
  for (const event of state.events) {
    let text: string | null = null;
    if (event.type === 'safety-car') text = `Safety car, for ${causePhrase(event.reason)}`;
    else if (event.type === 'virtual-safety-car') text = `Virtual safety car, for ${causePhrase(event.reason)}`;
    else if (event.type === 'green') text = 'Racing again';
    else if (event.type === 'red-flag') text = event.resumed ? 'Red flag: stopped, then restarted later' : 'Red flag: stopped for good';
    else if (event.type === 'rain' && event.state !== 'coming') text = event.state === 'started' ? 'Rain begins' : 'The rain stops';
    else if (event.type === 'crash') text = `${name(event.car)} crashes out`;
    else if (event.type === 'failure' && event.out) text = `${name(event.car)} retires with ${causePhrase(event.cause)}`;
    else if (event.type === 'out-of-fuel') text = `${name(event.car)} runs out of fuel`;
    else if (event.type === 'collision' && event.out.length > 0) {
      text = `${name(event.car)} and ${name(event.with)} collide: ${event.out.map(name).join(' and ')} out`;
    }
    if (text) lines.push({ lap: event.lap, text });
  }
  return lines;
}

export function RaceResult({ state, pole, title }: { state: RaceState; pole: Pole; title: string }) {
  const rows = classification(state);
  const winner = rows[0]!;
  const lines = story(state);

  return (
    <div class="split split--list">
      <div class="split__side">
      <section class="card" aria-labelledby="result-numbers">
        <h2 class="card__title" id="result-numbers">
          {title}
        </h2>
        <dl class="facts facts--tight">
          {summary({ state, rows, pole }).map(([label, value]) => (
            <div class="row" key={label}>
              <dt class="row__label">{label}</dt>
              <dd class="row__value">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {lines.length > 0 && (
        <section class="card card--list" aria-label="Race story">
          <ol>
            {lines.map((line, index) => (
              <li key={index}>
                <div class="story">
                  <span class="story__lap">Lap {line.lap}</span>
                  <span class="story__text">{line.text}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      </div>

      <section class="card card--list" aria-label="Result">
        <ol>
          {rows.map((row) => {
            const entrant = state.setup.grid.find((candidate) => candidate.id === row.car)!;
            const figure =
              row.position === 1
                ? 'Winner'
                : row.time !== null && winner.time !== null
                  ? formatGap(row.time - winner.time)
                  : causeLabel(row.status);
            return (
              <li key={row.car}>
                <div class={`result${row.classified ? '' : ' result--out'}${entrant.player ? ' result--mine' : ''}`}>
                  <span class="figure result__place">{row.classified ? row.position : '–'}</span>
                  <span class="team__colour" style={{ background: entrant.colour }} />
                  <span class="round__text">
                    <span class="round__name">{entrant.driverName}</span>
                    <span class="round__where">
                      {entrant.teamName} · started {ordinal(row.grid)}
                    </span>
                  </span>
                  <span class="team__figures">
                    <span class="figure">{figure}</span>
                    <span class="round__where">
                      {plural(row.stops, 'stop')}
                      {row.points > 0 ? ` · ${row.points} ${row.points === 1 ? 'pt' : 'pts'}` : ''}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
