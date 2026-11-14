import { useMemo, useState } from 'preact/hooks';
import { goBack } from '../../app/router';
import { driver as driverById, type RoundFact } from '../../game/data';
import {
  DRY_LIMIT,
  classification,
  quickRace,
  runToEnd,
  seedFrom,
  type RaceEvent,
  type RaceState,
  type ResultRow,
} from '../../game/sim';
import { formatGap, formatLap, formatRaceTime } from '../format';
import { IconBack } from '../icons';

/**
 * STAGE 3 BENCH. Runs a real round through the race engine and shows what happened: the result,
 * the numbers behind it and the turning points. The race view of Stage 4 replaces it.
 */

interface Outcome {
  state: RaceState;
  rows: ResultRow[];
  pole: { driver: string; time: number; wet: boolean };
}

function simulate(season: number, round: number, run: number): Outcome {
  const { qualifying, race } = quickRace(season, round, seedFrom('bench', season, round, run));
  runToEnd(race);
  const best = qualifying.parts[2]!.laps[0]!;
  const pole = race.setup.grid.find((entrant) => entrant.id === best.car)!;
  const wet = qualifying.parts[2]!.wetness > DRY_LIMIT;
  return { state: race, rows: classification(race), pole: { driver: pole.driver, time: best.time, wet } };
}

const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;
const ORDINALS = ['th', 'st', 'nd', 'rd'];
const ordinal = (place: number): string =>
  `${place}${place % 100 >= 11 && place % 100 <= 13 ? 'th' : (ORDINALS[place % 10] ?? 'th')}`;

function summary({ state, rows, pole }: Outcome): [string, string][] {
  const { setup, events } = state;
  const count = (type: RaceEvent['type']): number => events.filter((event) => event.type === type).length;
  const passes = events.filter((event) => event.type === 'overtake');
  const fought = passes.filter((event) => event.type === 'overtake' && !event.error).length;
  const rain = events.find((event) => event.type === 'rain' && event.state === 'started');
  const dry = setup.compounds.filter((tyre) => tyre.kind === 'dry').map((tyre) => tyre.name);

  let weather = 'Dry';
  if (state.declaredWet) weather = rain && rain.time > 60 ? `Rain from lap ${rain.lap}` : 'Wet from the start';
  else if (rain) weather = `A shower on lap ${rain.lap}`;

  const cautions = [
    count('safety-car') > 0 ? plural(count('safety-car'), 'safety car') : '',
    count('virtual-safety-car') > 0 ? `${count('virtual-safety-car')} virtual` : '',
    state.redFlags > 0 ? plural(state.redFlags, 'red flag') : '',
  ].filter(Boolean);

  const winner = rows[0]!;
  const facts: [string, string][] = [
    ['Pole', `${driverById(pole.driver).lastName}, ${formatLap(pole.time)}${pole.wet ? ' on a wet track' : ''}`],
    ['Race time', winner.time !== null ? formatRaceTime(winner.time) : `${winner.laps} laps`],
    ['Weather', weather],
    ['Safety car', cautions.join(', ') || 'None'],
    ['Overtakes', `${fought} fought for, ${passes.length - fought} through errors`],
    ['Pit stops', `${count('pit')}, on ${dry.join(', ')}`],
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
    if (event.type === 'safety-car') text = `Safety car: ${event.reason.toLowerCase()}`;
    else if (event.type === 'virtual-safety-car') text = `Virtual safety car: ${event.reason.toLowerCase()}`;
    else if (event.type === 'green') text = 'Racing again';
    else if (event.type === 'red-flag') text = event.resumed ? 'Red flag. The race is restarted later' : 'Red flag. The race is not restarted';
    else if (event.type === 'rain' && event.state !== 'coming') text = event.state === 'started' ? 'Rain begins' : 'The rain stops';
    else if (event.type === 'crash') text = `${name(event.car)} crashes out`;
    else if (event.type === 'failure' && event.out) text = `${name(event.car)} retires: ${event.cause.toLowerCase()}`;
    else if (event.type === 'out-of-fuel') text = `${name(event.car)} runs out of fuel`;
    else if (event.type === 'collision' && event.out.length > 0) {
      text = `${name(event.car)} and ${name(event.with)} collide: ${event.out.map(name).join(' and ')} out`;
    }
    if (text) lines.push({ lap: event.lap, text });
  }
  return lines;
}

export function RaceBenchScreen({ season, round }: { season: number; round: RoundFact }) {
  const [run, setRun] = useState(1);
  const outcome = useMemo(() => simulate(season, round.round, run), [season, round.round, run]);
  const { state, rows } = outcome;
  const winner = rows[0]!;
  const lines = story(state);

  return (
    <div class="shell">
      <header class="topbar">
        <div class="topbar__inner">
          <button type="button" class="back" onClick={() => goBack({ screen: 'almanac', season })}>
            <IconBack />
            Almanac
          </button>
          <span class="topbar__meta">Race bench</span>
        </div>
      </header>

      <main class="canvas canvas--above-bar">
        <div class="title-row">
          <h1 class="title">
            {season} {round.name}
          </h1>
          <p class="subtitle">
            The real grid of that weekend, run through the race engine. Every run is a different race.
          </p>
        </div>

        <section class="card" aria-labelledby="bench-numbers">
          <h2 class="card__title" id="bench-numbers">
            Run {run}
          </h2>
          <dl class="facts facts--tight">
            {summary(outcome).map(([label, value]) => (
              <div class="row" key={label}>
                <dt class="row__label">{label}</dt>
                <dd class="row__value">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section class="card card--list card--gap" aria-label="Result">
          <ol>
            {rows.map((row) => {
              const entrant = state.setup.grid.find((candidate) => candidate.id === row.car)!;
              const figure =
                row.position === 1
                  ? 'Winner'
                  : row.time !== null && winner.time !== null
                    ? formatGap(row.time - winner.time)
                    : row.status;
              return (
                <li key={row.car}>
                  <div class={`result${row.classified ? '' : ' result--out'}`}>
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

        {lines.length > 0 && (
          <section class="card card--list card--gap" aria-label="Race story">
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

        <p class="smallprint">
          A test bench for Stage 3. Cars are as quick and as fragile as they really were that season; the result is
          the engine's own.
        </p>
      </main>

      <div class="actionbar">
        <div class="actionbar__inner">
          <button type="button" class="button button--primary" onClick={() => { setRun(run + 1); window.scrollTo(0, 0); }}>
            Run it again
          </button>
        </div>
      </div>
    </div>
  );
}
