import { useEffect, useMemo, useState } from 'preact/hooks';
import { goBack } from '../../app/router';
import { app, careerIn, enterCareer, leaveCareer, updateCareer } from '../../app/session';
import { useStore } from '../../app/store';
import {
  finishPractice,
  finishRace,
  preseasonOpen,
  saveLive,
  savePractice,
  saveQualifying,
  type CareerState,
  type PracticeState,
} from '../../game/career';
import { calendar, circuit as circuitById, driver as driverById, knockoutCuts } from '../../game/data';
import { strategistSureness } from '../../game/team';
import {
  PRACTICE_RUNS,
  finishesOf,
  unitWear,
  playerCars,
  poleFor,
  practiceRun,
  practiceSetups,
  setDial,
  simulateRest,
  startPractice,
  startQualifying,
  startRace,
} from '../../game/season/sessions';
import { gridSource, sessionName, type SessionKind } from '../../game/season/weekend';
import { DIALS, runPart, type Approach, type Dial, type Hint, type QualifyingState, type RaceState } from '../../game/sim';
import type { SlotId } from '../../platform/saves';
import { formatLap } from '../format';
import { IconBack } from '../icons';
import { Briefing } from '../race/Briefing';
import { Grid } from '../race/Grid';
import { LiveRace } from '../race/LiveRace';
import { RaceResult, poleOf, type Pole } from '../race/Result';
import { TrackReading } from '../race/TrackReading';
import { teamLabel } from '../career/names';

/**
 * The sessions of a race weekend, one after another: practice, qualifying, the sprint sessions on
 * a sprint weekend, and the race. Each session is saved as it is completed; a race under way is
 * saved as it runs. After the race the career returns to its home screen for the management phase.
 */
export function WeekendScreen({ slot }: { slot: SlotId }) {
  const { active } = useStore(app);
  const career = active?.slot === slot ? active.career : null;
  // The session on screen: it stays until the player moves on, even once its result is saved.
  const [view, setView] = useState<SessionKind | null>(null);

  useEffect(() => {
    void enterCareer(slot);
    return () => {
      void leaveCareer();
    };
  }, [slot]);

  // Pin the session on arrival, so that saving its result does not move the screen on.
  useEffect(() => {
    if (career && view === null) setView(career.phase);
  }, [career, view]);
  const shown = view ?? career?.phase ?? null;
  // The winter's business (contracts, engine, sponsor) comes before the season's first session.
  const waiting = career !== null && preseasonOpen(career);
  useEffect(() => {
    if (career && (career.team === null || shown === 'management' || waiting)) {
      goBack({ screen: 'career', slot });
    }
  }, [career, shown, slot, waiting]);

  if (!career || !shown || shown === 'management' || career.team === null || waiting) return <div class="shell" />;

  const carryOn = (): void => {
    const now = careerIn(slot);
    if (!now || now.phase === 'management') {
      goBack({ screen: 'career', slot });
      return;
    }
    setView(now.phase);
    window.scrollTo(0, 0);
  };
  const colour = teamLabel(career.team, career.seasonYear).colour;
  const key = `${career.seasonYear}-${career.round}-${shown}`;

  return (
    <div class="shell" style={{ '--accent': colour }}>
      {shown === 'practice' && <Practice key={key} slot={slot} career={career} onContinue={carryOn} />}
      {(shown === 'qualifying' || shown === 'sprint-qualifying') && (
        <Qualifying key={key} slot={slot} career={career} kind={shown} onContinue={carryOn} />
      )}
      {(shown === 'race' || shown === 'sprint') && (
        <RaceSession key={key} slot={slot} career={career} kind={shown} onContinue={carryOn} />
      )}
    </div>
  );
}

function SessionBar({ slot, title }: { slot: SlotId; title: string }) {
  return (
    <header class="topbar">
      <div class="topbar__inner">
        <button type="button" class="back" onClick={() => goBack({ screen: 'career', slot })}>
          <IconBack />
          Team
        </button>
        <span class="topbar__meta">{title}</span>
      </div>
    </header>
  );
}

const roundOf = (career: CareerState) => calendar(career.seasonYear)[career.round - 1]!;

// ── Practice ────────────────────────────────────────────────────────────────────────────────

/** Each setting, its two ends, and what each end does in the race, in a plain line. */
const DIAL_WORDS: Readonly<
  Record<Dial, { name: string; low: string; lowDoes: string; high: string; highDoes: string }>
> = {
  wing: {
    name: 'Wing',
    low: 'Low drag',
    lowDoes: 'Faster on the straights, less grip in the corners.',
    high: 'Downforce',
    highDoes: 'More grip in the corners, slower on the straights.',
  },
  balance: {
    name: 'Balance',
    low: 'Stable rear',
    lowDoes: 'Steady and kind to the tyres, but slow to turn in.',
    high: 'Sharp front',
    highDoes: 'Turns into corners quickly, but the rear can slide.',
  },
  ride: {
    name: 'Suspension',
    low: 'Soft',
    lowDoes: 'Rides bumps and kerbs well, but leans in fast corners.',
    high: 'Stiff',
    highDoes: 'Sharp in fast corners, but jumpy over bumps.',
  },
};

/** What the driver said about a setting, and how far his arrow reaches (in points of the dial). */
const HINT_WORDS: Readonly<Record<Hint, { words: string; reach: number }>> = {
  'much-lower': { words: 'Lower it a lot', reach: -26 },
  lower: { words: 'Lower it a little', reach: -11 },
  good: { words: 'Spot on', reach: 0 },
  higher: { words: 'Raise it a little', reach: 11 },
  'much-higher': { words: 'Raise it a lot', reach: 26 },
};

/**
 * One setup dial: its two ends and what they do, the slider, and the driver's verdict drawn on the
 * slider as an arrow from the setting he drove, pointing the way to move it.
 */
function DialRow({
  dial,
  value,
  hint,
  tested,
  onStep,
}: {
  dial: Dial;
  value: number;
  hint: Hint | null;
  tested: number | null;
  onStep: (change: number) => void;
}) {
  const words = DIAL_WORDS[dial];
  const said = hint ? HINT_WORDS[hint] : null;
  const from = tested ?? value;
  const to = said ? Math.min(100, Math.max(0, from + said.reach)) : from;
  return (
    <div class="dial">
      <div class="dial__head">
        <span class="dial__name">{words.name}</span>
        {said && <span class={`dial__said${hint === 'good' ? ' dial__said--good' : ''}`}>Driver: {said.words.toLowerCase()}</span>}
        <span class="figure dial__value">{value}</span>
      </div>
      <div class="dial__control">
        <button type="button" class="button button--secondary dial__step" aria-label={`${words.name}: towards ${words.low.toLowerCase()}`} onClick={() => onStep(-5)}>
          −
        </button>
        <div
          class="dial__track"
          role="img"
          aria-label={`${words.name} at ${value} of 100${said ? `. The driver says: ${said.words.toLowerCase()}` : ''}`}
        >
          <span class="dial__bar">
            <span class="dial__fill" style={{ width: `${value}%` }} />
          </span>
          {said && tested !== null && <span class="dial__tested" style={{ left: `${from}%` }} />}
          {said && hint !== 'good' && (
            <span
              class={`dial__arrow dial__arrow--${to > from ? 'right' : 'left'}`}
              style={{ left: `${Math.min(from, to)}%`, width: `${Math.abs(to - from)}%` }}
            />
          )}
          {said && hint === 'good' && <span class="dial__spot" style={{ left: `${from}%` }} />}
          <span class="dial__thumb" style={{ left: `${value}%` }} />
        </div>
        <button type="button" class="button button--secondary dial__step" aria-label={`${words.name}: towards ${words.high.toLowerCase()}`} onClick={() => onStep(5)}>
          +
        </button>
      </div>
      <div class="dial__ends">
        <span class="dial__end">
          <span class="dial__end-name">{words.low}</span>
          {words.lowDoes}
        </span>
        <span class="dial__end dial__end--high">
          <span class="dial__end-name">{words.high}</span>
          {words.highDoes}
        </span>
      </div>
    </div>
  );
}

function Practice({ slot, career, onContinue }: { slot: SlotId; career: CareerState; onContinue: () => void }) {
  const cars = useMemo(() => playerCars(career), [career.seasonYear, career.round]);
  const [practice, setPractice] = useState<PracticeState>(() => career.weekend.practice ?? startPractice(career));
  const [selected, setSelected] = useState(0);
  const car = cars[selected]!;
  const dials = practice.dials[car.id]!;
  const hints = practice.hints[car.id];
  // Older saves did not record the setting of the last run: the arrow then starts where the dial is.
  const tested = practice.tested?.[car.id] ?? null;
  const runs = practice.runs[car.id] ?? 0;
  const round = roundOf(career);

  const run = (): void => {
    const next = practiceRun(career, practice, car.id);
    setPractice(next);
    void updateCareer((current) => savePractice(current, next));
  };
  const finish = (): void => {
    void updateCareer((current) => finishPractice(current, practiceSetups(current, practice)));
    onContinue();
  };

  return (
    <>
      <SessionBar slot={slot} title="Practice" />
      <main class="canvas canvas--above-bar" data-sessions={career.sessionsCompleted}>
        <div class="title-row">
          <h1 class="title">{round.name}</h1>
          <p class="subtitle">
            Practice. Adjust each car's setup, send the driver out, and he tells you which way to move each setting.{' '}
            {PRACTICE_RUNS} runs per car.
          </p>
        </div>

        <div class="segmented segmented--large" role="group" aria-label="Car">
          {cars.map((entrant, index) => (
            <button
              type="button"
              key={entrant.id}
              class={`segmented__option${index === selected ? ' segmented__option--on' : ''}`}
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
            >
              {entrant.driverName.split(' ').at(-1)}
            </button>
          ))}
        </div>

        <section class="card card--gap" aria-label={`Setup of ${car.driverName}'s car`}>
          {DIALS.map((dial) => (
            <DialRow
              key={dial}
              dial={dial}
              value={dials[dial]}
              hint={hints ? hints[dial] : null}
              tested={tested ? tested[dial] : null}
              onStep={(change) => setPractice(setDial(practice, car.id, dial, dials[dial] + change))}
            />
          ))}
        </section>
        <p class="smallprint">
          {hints
            ? `The arrows show what ${car.driverName.split(' ').at(-1)} said after the last run. Each starts at the setting he drove (the small mark) and points the way to move it; a long arrow means a big change. A consistent driver's feedback is more exact.`
            : "The car starts on the team's own first guess at a setup. Do a run, and the driver tells you which way to move each setting."}
        </p>
      </main>
      <div class="actionbar">
        <div class="actionbar__inner">
          <button type="button" class="button button--secondary" disabled={runs >= PRACTICE_RUNS} onClick={run}>
            {runs >= PRACTICE_RUNS ? 'No runs left' : `Do a run (${PRACTICE_RUNS - runs} left)`}
          </button>
          <button type="button" class="button button--primary" data-quick onClick={finish}>
            Finish practice
          </button>
        </div>
      </div>
    </>
  );
}

// ── Qualifying ──────────────────────────────────────────────────────────────────────────────

const APPROACHES: readonly { id: Approach; label: string }[] = [
  { id: 'safe', label: 'Safe' },
  { id: 'normal', label: 'Normal' },
  { id: 'push', label: 'Push' },
];

function Qualifying({
  slot,
  career,
  kind,
  onContinue,
}: {
  slot: SlotId;
  career: CareerState;
  kind: 'qualifying' | 'sprint-qualifying';
  onContinue: () => void;
}) {
  const name = sessionName(career.seasonYear, kind);
  const prefix = kind === 'qualifying' ? 'Q' : 'SQ';
  const [session] = useState<QualifyingState>(
    () => (kind === 'qualifying' ? career.weekend.qualifying : career.weekend.sprintQualifying) ?? startQualifying(career),
  );
  const [, setBeat] = useState(0);
  const cars = useMemo(() => playerCars(career), [career.seasonYear, career.round]);
  const [approach, setApproach] = useState<Record<string, Approach>>({});
  const round = roundOf(career);
  const last = session.parts.at(-1) ?? null;
  const done = session.part === 4;
  const entrants = session.setup.entrants;
  const byId = new Map(entrants.map((entrant) => [entrant.id, entrant]));

  const runNext = (): void => {
    runPart(session, approach);
    setBeat((beat) => beat + 1);
    void updateCareer((current) => saveQualifying(current, session));
    window.scrollTo(0, 0);
  };

  return (
    <>
      <SessionBar slot={slot} title={name} />
      <main class="canvas canvas--above-bar" data-sessions={career.sessionsCompleted}>
        <div class="title-row">
          <h1 class="title">{round.name}</h1>
          <p class="subtitle">
            {done ? (
              `${name} is over. The top ten below start in this order; the rest start in the order they were knocked out.`
            ) : (
              <>
                {name} has three parts. After each of the first two, the slowest {knockoutCuts(entrants.length)[0]} cars
                drop out; the last ten fight for the front of the grid. Part {session.part} of 3 ({prefix}
                {session.part}). <TrackReading wetness={session.wetness} />
              </>
            )}
          </p>
        </div>

        {!done && (
          <section class="card stack" aria-labelledby="quali-approach">
            <h2 class="card__title" id="quali-approach">
              How hard to push in part {session.part}
            </h2>
            {cars
              .filter((entrant) => session.through.includes(entrant.id))
              .map((entrant) => (
                <div class="control control--wide" key={entrant.id}>
                  <span class="control__name">{driverById(entrant.driver).lastName}</span>
                  <div class="segmented segmented--large" role="group" aria-label={`How hard to push, ${entrant.driverName}`}>
                    {APPROACHES.map((option) => {
                      const on = (approach[entrant.id] ?? 'normal') === option.id;
                      return (
                        <button
                          type="button"
                          key={option.id}
                          class={`segmented__option${on ? ' segmented__option--on' : ''}`}
                          aria-pressed={on}
                          onClick={() => setApproach({ ...approach, [entrant.id]: option.id })}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            {cars.every((entrant) => !session.through.includes(entrant.id)) && (
              <p class="muted">Both cars are out. The session runs on without them.</p>
            )}
            <p class="muted">
              Safe: a little slower, but rarely goes wrong. Normal: the usual lap. Push: a little faster, but a ruined
              lap is far likelier.
            </p>
          </section>
        )}

        {last && (
          <section class={`card card--list${done ? '' : ' card--gap'}`} aria-label={`${prefix}${last.part} times`}>
            <h2 class="card__title card__title--list">
              Part {last.part} times ({prefix}
              {last.part})
            </h2>
            <ol>
              {last.laps.map((lap, index) => {
                const entrant = byId.get(lap.car)!;
                const out = last.knockedOut.includes(lap.car);
                const gap = lap.time - last.laps[0]!.time;
                return (
                  <li key={lap.car}>
                    <div class={`result${entrant.player ? ' result--mine' : ''}${out ? ' result--out' : ''}`}>
                      <span class="figure result__place">{index + 1}</span>
                      <span class="team__colour" style={{ background: entrant.colour }} />
                      <span class="round__text">
                        <span class="round__name">{entrant.driverName}</span>
                        <span class="round__where">
                          {entrant.teamName}
                          {out ? ` · out after part ${last.part}` : ''}
                          {lap.error ? ' · mistake on the lap' : ''}
                        </span>
                      </span>
                      <span class="team__figures">
                        <span class="figure">{index === 0 ? formatLap(lap.time) : `+${gap.toFixed(3)}s`}</span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </main>
      <div class="actionbar">
        <div class="actionbar__inner">
          {done ? (
            <button type="button" class="button button--primary" data-quick onClick={onContinue}>
              Continue
            </button>
          ) : (
            <button type="button" class="button button--primary" data-quick onClick={runNext}>
              Run part {session.part} ({prefix}
              {session.part})
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── The race and the sprint ─────────────────────────────────────────────────────────────────

function poleInfo(career: CareerState, race: RaceState): Pole {
  const source = gridSource(career.seasonYear, career.round, race.setup.kind);
  const session = source === 'qualifying' ? career.weekend.qualifying : source === 'sprint-qualifying' ? career.weekend.sprintQualifying : null;
  if (session && session.part === 4) return poleOf(session, race);
  return { driver: race.setup.grid[0]!.driver, time: null, wet: false };
}

function RaceSession({
  slot,
  career,
  kind,
  onContinue,
}: {
  slot: SlotId;
  career: CareerState;
  kind: 'race' | 'sprint';
  onContinue: () => void;
}) {
  const resumed = career.weekend.live !== null;
  const race = useMemo(() => career.weekend.live ?? startRace(career), []);
  const pole = useMemo(() => poleInfo(career, race), [race]);
  const [step, setStep] = useState<'briefing' | 'grid' | 'live' | 'result'>(resumed ? 'live' : 'briefing');
  const sureness = career.outfit ? strategistSureness(career.outfit) : 0.5;
  const [, setBeat] = useState(0);
  const round = roundOf(career);
  const name = sessionName(career.seasonYear, kind);
  const lower = name.toLowerCase();

  const record = (): void => {
    const now = careerIn(slot);
    if (!now || (now.phase !== 'race' && now.phase !== 'sprint')) return;
    const poleDriver = kind === 'race' ? poleFor(now) : null;
    void updateCareer((current) => finishRace(current, finishesOf(race), poleDriver, unitWear(current, race)));
    setStep('result');
    window.scrollTo(0, 0);
  };
  const keep = (): void => {
    void updateCareer((current) => saveLive(current, race));
  };

  // A race finished but not recorded (the app closed at the flag) is recorded now.
  useEffect(() => {
    if (resumed && race.phase === 'finished') record();
  }, []);

  if (step === 'live') {
    return (
      <LiveRace
        state={race}
        onFinish={record}
        onLeave={() => {
          keep();
          goBack({ screen: 'career', slot });
        }}
        onProgress={keep}
        keepOnLeave
        startPaused={resumed}
        sureness={sureness}
      />
    );
  }

  return (
    <>
      <SessionBar slot={slot} title={step === 'result' ? `${name} result` : name} />
      <main class="canvas canvas--above-bar" data-sessions={career.sessionsCompleted}>
        <div class="title-row">
          <h1 class="title">{step === 'briefing' ? `${career.seasonYear} ${round.name}` : round.name}</h1>
          <p class="subtitle">
            {step === 'result'
              ? `${name} result.`
              : step === 'briefing'
                ? `${circuitById(race.setup.circuit).name}, ${circuitById(race.setup.circuit).country} · Round ${career.round} of ${calendar(career.seasonYear).length}`
                : (
                <>
                  {name}, {race.setup.laps} laps. <TrackReading wetness={race.wetness} />
                  {gridSource(career.seasonYear, career.round, kind) === 'sprint'
                    ? ' The starting order is the sprint\'s finishing order.'
                    : ''}
                </>
              )}
          </p>
        </div>
        {step === 'briefing' && (
          <Briefing
            state={race}
            sponsor={career.outfit?.sponsor ?? null}
            challenge={career.outfit?.challenge ?? null}
            sureness={sureness}
          />
        )}
        {step === 'grid' && <Grid state={race} onChange={() => setBeat((beat) => beat + 1)} sureness={sureness} />}
        {step === 'result' && <RaceResult state={race} pole={pole} title={name} />}
      </main>
      <div class="actionbar">
        <div class="actionbar__inner">
          {step === 'briefing' ? (
            <button
              type="button"
              class="button button--primary"
              data-quick
              onClick={() => {
                setStep('grid');
                window.scrollTo(0, 0);
              }}
            >
              To the grid
            </button>
          ) : step === 'grid' ? (
            <>
              <button
                type="button"
                class="button button--secondary"
                data-quick
                onClick={() => {
                  simulateRest(race);
                  record();
                }}
              >
                Skip to the result
              </button>
              <button
                type="button"
                class="button button--primary"
                onClick={() => {
                  keep();
                  setStep('live');
                }}
              >
                Start the {lower}
              </button>
            </>
          ) : (
            <button type="button" class="button button--primary" data-quick onClick={onContinue}>
              Continue
            </button>
          )}
        </div>
      </div>
    </>
  );
}
