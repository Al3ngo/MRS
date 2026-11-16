import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { circuit as circuitById } from '../../game/data';
import {
  PUSH_LEVELS,
  command,
  energyModeOpen,
  energyModes,
  carOutlook,
  pitAdvice,
  rainAt,
  type CarState,
  type Compound,
  type EngineMode,
  type RaceState,
} from '../../game/sim';
import { useStore } from '../../app/store';
import { landscape } from '../../platform/orientation';
import { setSound, soundSettings } from '../../platform/sound';
import { IconBack, IconForward, IconHelp, IconMuted, IconPause, IconSkip, IconSound } from '../icons';
import { Meter, batteryMeter, fuelMeter, stressMeter, tyreMeter } from '../Meter';
import { Forecast } from './Forecast';
import { OutlookGraph } from './OutlookGraph';
import { ConfirmSheet, Sheet } from '../Sheet';
import { RaceClock, SPEEDS, type Speed } from './clock';
import { drawScene, trackPath, type CarMark, type Scene } from './draw';
import { RaceSound } from './raceSound';
import { momentOf, together, type Moment } from './moments';
import { fitTrack, trackMap, type Fit } from './track';
import {
  ENGINE_HELP,
  ENGINE_WORDS,
  PUSH_HELP,
  PUSH_WORDS,
  STRESS_HELP,
  causeLabel,
  energyHelp,
  energyWords,
  feedLine,
  outlookWords,
  placeWords,
  raceGuide,
  type FeedLine,
} from './words';

/**
 * The race as it runs, laid out sideways: the running order down the left, the circuit from above
 * in the middle, and the player's two cars with their controls down the right. Nothing scrolls as
 * a whole; only the running order does. Moments worth watching slow the race and show a message
 * over the map.
 */

const ENGINE_MODES: readonly EngineMode[] = ['save', 'standard', 'push'];

/** Which control the line under the controls is explaining. */
type Help = 'push' | 'engine' | 'energy' | 'stress';

interface Props {
  state: RaceState;
  /** Called once, when the last car has finished or the race has been skipped to its end. */
  onFinish: () => void;
  /** Called when the player leaves the race. */
  onLeave: () => void;
  /**
   * Called whenever the race is worth saving: every other lap, on a pause, when a sheet opens and
   * when the app goes to the background. A race that is kept can be carried on later.
   */
  onProgress?: () => void;
  /** Leaving keeps the race to carry on later, rather than giving it up. */
  keepOnLeave?: boolean;
  /** Starts with the clock stopped: for a race being carried on. */
  startPaused?: boolean;
  /** The team strategist's sureness, 0 to 1, for the weather forecast. */
  sureness?: number;
  /** Holds the clock, as an open sheet does: while a tutorial tip is being read. */
  hold?: boolean;
  /** Drawn over the race: a tutorial tip. */
  children?: ComponentChildren;
}

/** Room the weather takes on the map: a strip along the top, or columns down the left and right. */
const FORECAST_STRIP = 30;
const FORECAST_LEFT = 62;
const FORECAST_RIGHT = 54;

/** A moment on screen: the message, and when it ends (in performance.now() time). */
interface Playing {
  moment: Moment;
  until: number;
}

export function LiveRace({
  state,
  onFinish,
  onLeave,
  onProgress,
  keepOnLeave = false,
  startPaused = false,
  sureness = 0.5,
  hold = false,
  children,
}: Props) {
  const { setup } = state;
  const clock = useMemo(() => new RaceClock(state), [state]);
  const map = useMemo(() => trackMap(circuitById(setup.circuit).outline), [setup.circuit]);
  const mine = useMemo(() => state.cars.filter((car) => setup.grid[car.entrant]!.player), [state]);

  const [, setBeat] = useState(0);
  const sound = useStore(soundSettings);
  const upright = !useStore(landscape);
  const [speed, setSpeed] = useState<Speed>(startPaused ? 0 : 1);
  const [selected, setSelected] = useState(0);
  const [sheet, setSheet] = useState<'pit' | 'skip' | 'leave' | 'guide' | 'order' | null>(null);
  const [help, setHelp] = useState<Help>('push');
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [shown, setShown] = useState<Moment | null>(null);
  const playing = useRef<Playing | null>(null);
  // Where the weather sits on the map: along the top, or down the sides when the map is wide and short.
  const [forecastAt, setForecastAt] = useState<'top' | 'sides'>('top');
  const canvas = useRef<HTMLCanvasElement>(null);
  const finished = useRef(onFinish);
  finished.current = onFinish;
  const progress = useRef(onProgress);
  progress.current = onProgress;

  // A pause or an open sheet is a natural moment to save.
  useEffect(() => {
    if ((speed === 0 || sheet) && state.phase !== 'finished') progress.current?.();
  }, [speed, sheet, state]);

  useEffect(() => {
    const hidden = (): void => {
      if (document.visibilityState === 'hidden' && state.phase !== 'finished') progress.current?.();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, [state]);

  // A sheet stops the clock: nobody should lose places while choosing tyres. So does a tip, and
  // so does a phone turned upright (the game is hidden behind "turn your phone sideways").
  clock.speed = sheet || hold || upright ? 0 : speed;

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext('2d');
    if (!context) return;

    let width = 0;
    let height = 0;
    let fit: Fit | null = null;
    let path: Path2D | null = null;
    const measure = (): void => {
      const box = element.getBoundingClientRect();
      const ratio = Math.min(3, window.devicePixelRatio || 1);
      width = box.width;
      height = box.height;
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      // The weather sits along the top of the map with the circuit below it, unless the map is so
      // wide and short that the circuit draws bigger with the weather down its sides.
      const top = fitTrack(map, width, height - FORECAST_STRIP, 22);
      const side = fitTrack(map, width - FORECAST_LEFT - FORECAST_RIGHT, height, 22);
      const sides = side.scale > top.scale * 1.12;
      fit = sides ? { ...side, offsetX: side.offsetX + FORECAST_LEFT } : { ...top, offsetY: top.offsetY + FORECAST_STRIP };
      setForecastAt(sides ? 'sides' : 'top');
      path = trackPath(map, fit);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    const marks: CarMark[] = state.cars.map((car) => {
      const entrant = setup.grid[car.entrant]!;
      return { lap: 0, colour: entrant.colour, code: entrant.code, mine: entrant.player, pit: false, gone: false, focus: false };
    });
    const scene: Scene = { cars: marks, safetyCar: null, wetness: 0, caution: 'none' };

    const audio = new RaceSound(state, map, clock);
    let frame = 0;
    let last = performance.now();
    let shownAt = 0;
    let seen = state.events.length;
    let done = false;
    let savedLap = state.lap;
    const loop = (now: number): void => {
      frame = requestAnimationFrame(loop);
      // A moment being shown slows the race, or holds it still, until it has played.
      const moment = playing.current;
      if (moment && now >= moment.until) {
        playing.current = null;
        setShown(null);
      }
      clock.slow = playing.current ? playing.current.moment.rate : 1;
      const steps = document.hidden ? 0 : clock.run(now - last);
      last = now;

      if (fit && path) {
        const focus = playing.current?.moment.cars ?? [];
        // Marks are kept in running order, so the leaders are drawn on top.
        for (const car of state.cars) {
          const mark = marks[car.position - 1]!;
          const entrant = setup.grid[car.entrant]!;
          mark.lap = clock.shown(car.entrant);
          mark.colour = entrant.colour;
          mark.code = entrant.code;
          mark.mine = entrant.player;
          mark.pit = car.status === 'pit';
          mark.gone = car.status === 'out' || car.status === 'finished';
          mark.focus = focus.includes(car.id);
        }
        scene.safetyCar = clock.safetyCar();
        scene.wetness = state.wetness;
        scene.caution = state.flag.kind === 'green' ? 'none' : 'yellow';
        drawScene(context, width, height, map, fit, path, scene);
      }
      audio.frame(clock, document.hidden ? 0 : clock.speed * clock.slow);

      if (seen < state.events.length) {
        const fresh: FeedLine[] = [];
        for (; seen < state.events.length; seen++) {
          const event = state.events[seen]!;
          audio.event(event);
          const line = feedLine(state, event);
          if (line) fresh.push(line);
          // Not after a skip to the end: the race is over before anything could be watched.
          const next = state.phase === 'finished' ? null : momentOf(state, event, line);
          if (next) {
            playing.current = together(playing.current, next, now);
            setShown(playing.current.moment);
          }
        }
        if (fresh.length > 0) setFeed((lines) => [...fresh.reverse(), ...lines].slice(0, 30));
      }
      if (steps > 0 && now - shownAt > 180) {
        shownAt = now;
        setBeat((beat) => beat + 1);
      }
      if (state.lap >= savedLap + 2 && state.phase !== 'finished') {
        savedLap = state.lap;
        progress.current?.();
      }
      if (state.phase === 'finished' && !done) {
        done = true;
        playing.current = null;
        setShown(null);
        finished.current();
      }
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      audio.stop();
    };
  }, [state, clock, map]);

  const car = mine[selected] ?? null;
  const order = [...state.cars].sort((a, b) => a.position - b.position);
  const raining = rainAt(state.rain, state.time + state.stopped) > 0;
  const lap = Math.min(setup.laps, state.lap + 1);
  const give = (order: Parameters<typeof command>[1]): void => {
    command(state, order);
    setBeat((beat) => beat + 1);
  };
  // Tapping the message lets the race run on at the chosen speed.
  const resume = (): void => {
    playing.current = null;
    setShown(null);
  };

  return (
    <div class={`race${mine.length === 0 ? ' race--watch' : ''}`}>
      <header class="race__bar">
        <span class="race__left">
          <button type="button" class="back" aria-label="Leave the race" onClick={() => setSheet('leave')}>
            <IconBack />
            <span class="race__leave">Leave</span>
          </button>
          <button type="button" class="icon-button" aria-label="What everything means" onClick={() => setSheet('guide')}>
            <IconHelp />
          </button>
          <button
            type="button"
            class="icon-button"
            aria-label={sound.muted ? 'Sound off: turn it on' : 'Sound on: turn it off'}
            aria-pressed={!sound.muted}
            onClick={() => setSound({ muted: !sound.muted })}
          >
            {sound.muted ? <IconMuted /> : <IconSound />}
          </button>
        </span>
        <span class="race__middle">
          <span class="race__lap figure" aria-label={`Lap ${lap} of ${setup.laps}`}>
            Lap {lap}
            <span class="race__laps"> / {setup.laps}</span>
          </span>
          <FlagPill state={state} />
          {raining && <span class="race__weather">Raining</span>}
        </span>
        <div class="segmented race__speed" role="group" aria-label="Race speed">
          <button
            type="button"
            class={`segmented__option${speed === 0 ? ' segmented__option--on' : ''}`}
            aria-pressed={speed === 0}
            aria-label="Pause"
            onClick={() => setSpeed(0)}
          >
            <IconPause />
          </button>
          {SPEEDS.map((value) => (
            <button
              type="button"
              key={value}
              class={`segmented__option figure${speed === value ? ' segmented__option--on' : ''}`}
              aria-pressed={speed === value}
              aria-label={`Speed ${value}x`}
              onClick={() => setSpeed(value)}
            >
              {value}x
            </button>
          ))}
          <button type="button" class="segmented__option" aria-label="Skip to the end" onClick={() => setSheet('skip')}>
            <IconSkip />
          </button>
        </div>
      </header>

      <section class="race__order" aria-label="Running order">
        <button type="button" class="race__order-head" aria-label="Running order: tap for tyres and stops" onClick={() => setSheet('order')}>
          <span>Order</span>
          <IconForward />
        </button>
        <ol class="tower tower--compact">
          {order.map((entry) => (
            <TowerRow key={entry.id} state={state} car={entry} compact />
          ))}
        </ol>
      </section>

      <div class="race__map">
        <canvas ref={canvas} role="img" aria-label={`${setup.name}: the circuit from above, with every car`} />
        <Forecast state={state} layout={forecastAt} sureness={sureness} />
        {shown && (
          <button type="button" class={`moment moment--${shown.kind}`} aria-live="assertive" onClick={resume}>
            <span class="moment__head">
              <span class="moment__title">{shown.title}</span>
              <span class="moment__pace">{shown.rate === 0 ? 'Paused' : 'Slow motion'}</span>
            </span>
            <span class="moment__line">
              {shown.line.who && (
                <span class="moment__who" style={{ color: shown.line.who.colour }}>
                  {shown.line.who.code}
                </span>
              )}
              {shown.line.text}
            </span>
          </button>
        )}
        <ol class="feed" aria-label="Race feed" aria-live="polite">
          {feed.slice(0, 2).map((line, index) => (
            <li class={`feed__line feed__line--${line.kind}${index > 0 ? ' feed__line--old' : ''}`} key={`${feed.length - index}`}>
              {line.who && (
                <span class="feed__who" style={{ color: line.who.colour }}>
                  {line.who.code}
                </span>
              )}
              <span class="feed__text">{line.text}</span>
            </li>
          ))}
        </ol>
      </div>

      {car && (
      <section class="pitwall" aria-label="Your cars">
        {(
          <>
            <div class="pitwall__cars">
              {mine.map((entry, index) => (
                <CarCard
                  key={entry.id}
                  state={state}
                  car={entry}
                  on={index === selected}
                  onSelect={() => setSelected(index)}
                />
              ))}
            </div>
            <div class="control control--large">
              <button type="button" class="control__name stress" onClick={() => setHelp('stress')}>
                <span class={car.stress >= 70 ? 'stress__word--high' : undefined}>Stress</span>
                <Meter {...stressMeter(car.stress)} size="small" label={`Driver stress: ${stressMeter(car.stress).words}`} />
              </button>
              <div class="segmented segmented--large" role="group" aria-label={`Push level, ${setup.grid[car.entrant]!.code}`}>
                {PUSH_LEVELS.map((level) => (
                  <button
                    type="button"
                    key={level}
                    class={`segmented__option${car.push === level ? ' segmented__option--on' : ''}`}
                    aria-pressed={car.push === level}
                    disabled={car.status === 'out' || car.status === 'finished'}
                    onClick={() => {
                      give({ type: 'push', car: car.id, level });
                      setHelp('push');
                    }}
                  >
                    {PUSH_WORDS[level]}
                  </button>
                ))}
              </div>
            </div>
            <div class="control">
              <span class="control__name">Engine</span>
              <div class="segmented" role="group" aria-label={`Engine mode, ${setup.grid[car.entrant]!.code}`}>
                {ENGINE_MODES.map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    class={`segmented__option${car.engineMode === mode ? ' segmented__option--on' : ''}`}
                    aria-pressed={car.engineMode === mode}
                    disabled={car.status === 'out' || car.status === 'finished'}
                    onClick={() => {
                      give({ type: 'engine-mode', car: car.id, mode });
                      setHelp('engine');
                    }}
                  >
                    {ENGINE_WORDS[mode]}
                  </button>
                ))}
              </div>
            </div>
            {setup.rules.recovery !== 'none' && (
              <div class="control">
                <span class="control__name">Battery</span>
                <div class="segmented" role="group" aria-label={`Battery mode, ${setup.grid[car.entrant]!.code}`}>
                  {energyModes(setup.rules.recovery).map((mode) => (
                    <button
                      type="button"
                      key={mode}
                      class={`segmented__option${car.energyMode === mode ? ' segmented__option--on' : ''}`}
                      aria-pressed={car.energyMode === mode}
                      disabled={!energyModeOpen(state, car, mode)}
                      onClick={() => {
                        give({ type: 'energy-mode', car: car.id, mode });
                        setHelp('energy');
                      }}
                    >
                      {energyWords(setup.rules, mode)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p class="control__help" aria-live="polite">
              {help === 'stress'
                ? STRESS_HELP
                : help === 'engine'
                  ? ENGINE_HELP[car.engineMode]
                  : help === 'energy' && setup.rules.recovery !== 'none'
                    ? energyHelp(setup.rules, car.energyMode)
                    : PUSH_HELP[car.push]}
            </p>
            <button
              type="button"
              class="button button--primary pitwall__pit"
              disabled={car.status !== 'running'}
              onClick={() => setSheet('pit')}
            >
              {pitLabel(state, car)}
            </button>
          </>
        )}
      </section>
      )}

      {sheet === 'pit' && car && <PitSheet state={state} car={car} give={give} onClose={() => setSheet(null)} />}
      {sheet === 'order' && (
        <Sheet title={`Running order, lap ${lap}`} onClose={() => setSheet(null)}>
          <ol class="tower tower--sheet">
            <li class="tower__row tower__head" aria-hidden="true">
              <span />
              <span />
              <span />
              <span class="tower__gap">Gap ahead</span>
              <span class="tower__tyre">Tyre</span>
              <span class="tower__stops">Stops</span>
            </li>
            {order.map((entry) => (
              <TowerRow key={entry.id} state={state} car={entry} />
            ))}
          </ol>
          <div class="sheet__actions">
            <button type="button" class="button button--block button--secondary" onClick={() => setSheet(null)}>
              Close
            </button>
          </div>
        </Sheet>
      )}
      {sheet === 'skip' && (
        <ConfirmSheet
          title="Skip to the end?"
          lines={[
            mine.length > 0
              ? 'The rest of the race is run at once. The team takes over your cars and makes their calls.'
              : 'The rest of the race is run at once.',
          ]}
          confirmLabel="Skip to the end"
          cancelLabel="Keep watching"
          onConfirm={() => {
            setSheet(null);
            clock.skip();
          }}
          onCancel={() => setSheet(null)}
        />
      )}
      {sheet === 'guide' && (
        <Sheet title="What everything means" onClose={() => setSheet(null)}>
          <dl class="guide">
            {raceGuide(setup.rules).map((entry) => (
              <div class="guide__entry" key={entry.term}>
                <dt class="guide__term">{entry.term}</dt>
                <dd class="guide__meaning">{entry.meaning}</dd>
              </div>
            ))}
          </dl>
          <div class="sheet__actions">
            <button type="button" class="button button--block button--secondary" onClick={() => setSheet(null)}>
              Close
            </button>
          </div>
        </Sheet>
      )}
      {sheet === 'leave' && (
        <ConfirmSheet
          title="Leave the race?"
          lines={[
            keepOnLeave
              ? 'The race is kept where it stands. Carry on with it from the team screen.'
              : 'The race is given up where it stands. Nothing is kept.',
          ]}
          confirmLabel={keepOnLeave ? 'Leave for now' : 'Leave the race'}
          cancelLabel="Stay"
          tone={keepOnLeave ? 'primary' : 'danger'}
          onConfirm={onLeave}
          onCancel={() => setSheet(null)}
        />
      )}
      {children}
    </div>
  );
}

function FlagPill({ state }: { state: RaceState }) {
  if (state.phase === 'finished' || state.chequered) return <span class="pill">Chequered flag</span>;
  if (state.flag.kind === 'safety-car') return <span class="pill pill--warning">Safety car</span>;
  if (state.flag.kind === 'virtual-safety-car') return <span class="pill pill--warning">Virtual safety car</span>;
  return <span class="pill pill--positive">Green flag</span>;
}

const tyreOf = (state: RaceState, car: CarState): Compound =>
  state.setup.compounds.find((tyre) => tyre.id === car.tyre)!;

function pitLabel(state: RaceState, car: CarState): string {
  if (car.status === 'pit') return 'In the pits';
  if (car.pitCall) return `Stopping: ${state.setup.compounds.find((tyre) => tyre.id === car.pitCall!.compound)!.name}`;
  const next = car.plan[0];
  return next ? `Pit stop (lap ${next.lap})` : 'Pit stop';
}

function TowerRow({ state, car, compact = false }: { state: RaceState; car: CarState; compact?: boolean }) {
  const entrant = state.setup.grid[car.entrant]!;
  const tyre = tyreOf(state, car);
  let gap: string;
  if (car.status === 'out') gap = causeLabel(car.retiredWith ?? 'Out');
  else if (car.status === 'finished') gap = 'Finished';
  else if (car.status === 'pit') gap = 'In pits';
  else if (car.position === 1) gap = 'Leader';
  else if (car.lapsDown > 0) gap = `+${car.lapsDown} lap${car.lapsDown === 1 ? '' : 's'}`;
  else gap = `+${car.interval.toFixed(1)}s`;
  const gone = car.status === 'out';
  if (compact) {
    return (
      <li class={`tower__row${entrant.player ? ' tower__row--mine' : ''}${gone ? ' tower__row--out' : ''}`}>
        <span class="figure tower__place">{gone ? '–' : car.position}</span>
        <span class="tower__colour" style={{ background: entrant.colour }} />
        <span class="tower__code">{entrant.code}</span>
        <span class="figure tower__gap">{gone ? 'Out' : car.status === 'pit' ? 'Pit' : car.position === 1 ? '' : car.lapsDown > 0 ? `+${car.lapsDown}L` : `+${car.interval.toFixed(1)}`}</span>
        <span class="tyre" style={{ background: tyre.colour }} />
      </li>
    );
  }
  return (
    <li class={`tower__row${entrant.player ? ' tower__row--mine' : ''}${gone ? ' tower__row--out' : ''}`}>
      <span class="figure tower__place">{gone ? '–' : car.position}</span>
      <span class="tower__colour" style={{ background: entrant.colour }} />
      <span class="tower__code">{entrant.code}</span>
      <span class="figure tower__gap">{gap}</span>
      <span class="tower__tyre">
        <span class="tyre" style={{ background: tyre.colour }} />
        {(car.status === 'running' || car.status === 'pit') && (
          <Meter {...tyreMeter(car.wear)} size="small" label={`${tyre.name} tyres, ${tyreMeter(car.wear).words}`} />
        )}
      </span>
      <span class="figure tower__stops">{car.stops}</span>
    </li>
  );
}

function CarCard({ state, car, on, onSelect }: { state: RaceState; car: CarState; on: boolean; onSelect: () => void }) {
  const { setup } = state;
  const entrant = setup.grid[car.entrant]!;
  const tyre = tyreOf(state, car);
  const racing = car.status === 'running' || car.status === 'pit';
  const outlook = carOutlook(state, car);
  const words = outlookWords(outlook);
  const tyres = tyreMeter(car.wear);
  const fuel = fuelMeter(outlook.fuel[0] ?? 0, 1, outlook.fuelSpare);
  const battery = batteryMeter(car.battery);
  const stress = stressMeter(car.stress);
  return (
    <button type="button" class={`carcard${on ? ' carcard--on' : ''}`} aria-pressed={on} onClick={onSelect}>
      <span class="carcard__head">
        <span class="tower__colour" style={{ background: entrant.colour }} />
        <span class="carcard__code">{entrant.code}</span>
        {car.aidOpen && <span class="carcard__aid">DRS open</span>}
        <span class="figure carcard__place">{car.status === 'out' ? '–' : placeWords(car.position)}</span>
      </span>
      {racing ? (
        <span class="carcard__meters">
          <OutlookGraph
            outlook={outlook}
            tyreColour={tyre.colour}
            tyreWords={`${tyre.name} tyres, ${tyres.words}. ${words.tyres}.`}
            fuelWords={`Fuel: ${fuel.words}. ${words.fuel}.`}
          />
          {setup.rules.recovery !== 'none' && (
            <span class="carcard__meter">
              <span class="carcard__label">Battery</span>
              <Meter fill={battery.fill} good={battery.good} size="small" label={`Battery ${battery.words}`} />
            </span>
          )}
          {words.warning && <span class="carcard__warning">{words.warning}</span>}
        </span>
      ) : (
        <>
          <span class="carcard__line">
            {car.status === 'out' ? `Out: ${causeLabel(car.retiredWith ?? 'Retired').toLowerCase()}` : 'Finished'}
          </span>
          <span class="carcard__line">
            {car.status === 'out' ? `After ${car.lap} laps` : `${car.stops} ${car.stops === 1 ? 'stop' : 'stops'}`}
          </span>
        </>
      )}
      {racing && (
        <Meter fill={stress.fill} good={stress.good} size="thin" class="carcard__stress" label={`Driver stress: ${stress.words}`} />
      )}
    </button>
  );
}

function PitSheet({
  state,
  car,
  give,
  onClose,
}: {
  state: RaceState;
  car: CarState;
  give: (order: Parameters<typeof command>[1]) => void;
  onClose: () => void;
}) {
  const { setup } = state;
  const entrant = setup.grid[car.entrant]!;
  const fitted = tyreOf(state, car);
  const advice = pitAdvice(state, car);
  const [choice, setChoice] = useState(advice.suggested);
  const owes = advice.owesSecondType;
  const lapsLeft = advice.lapsAfterThis;
  return (
    <Sheet title={`Pit stop: ${entrant.driverName}`} onClose={onClose}>
      <p class="sheet__text">
        {lapsLeft} {lapsLeft === 1 ? 'lap' : 'laps'} to go after this one. On {fitted.name.toLowerCase()} tyres for{' '}
        {advice.tyreLaps} laps.
      </p>
      <div class="sheet__meter">
        <span class="sheet__meter-label">Tyres now</span>
        <Meter {...tyreMeter(car.wear)} label={`Tyres now: ${tyreMeter(car.wear).words}`} />
      </div>
      {owes && (
        <p class="notice">
          The rules say a car must use two different dry tyre types in a dry race. This car has used only one so far.
        </p>
      )}
      <div class="choices" role="radiogroup" aria-label="Tyres to fit">
        {setup.compounds.map((tyre) => (
          <button
            type="button"
            key={tyre.id}
            role="radio"
            aria-checked={choice === tyre.id}
            class={`choice${choice === tyre.id ? ' choice--on' : ''}`}
            onClick={() => setChoice(tyre.id)}
          >
            <span class="tyre tyre--large" style={{ background: tyre.colour }} />
            <span class="choice__name">{tyre.name}</span>
            <span class="choice__note">
              {tyre.kind === 'dry' ? `lasts about ${advice.lasts[tyre.id]} laps` : tyre.kind === 'inter' ? 'for a damp track' : 'for heavy rain'}
            </span>
          </button>
        ))}
      </div>
      {car.plan.length > 0 && (
        <p class="sheet__text">
          Planned:{' '}
          {car.plan
            .map((stop) => `lap ${stop.lap}, ${setup.compounds.find((tyre) => tyre.id === stop.compound)!.name.toLowerCase()}`)
            .join('; ')}
          . A stop made now replaces the next planned one.
        </p>
      )}
      <div class="sheet__actions">
        <button
          type="button"
          class="button button--block button--primary"
          onClick={() => {
            give({ type: 'pit', car: car.id, compound: choice });
            onClose();
          }}
        >
          Stop at the end of this lap
        </button>
        {car.pitCall && !car.forcedStop && (
          <button
            type="button"
            class="button button--block button--secondary"
            onClick={() => {
              give({ type: 'cancel-pit', car: car.id });
              onClose();
            }}
          >
            Cancel the stop
          </button>
        )}
        <button
          type="button"
          class="button button--block button--secondary"
          onClick={() => {
            give({ type: 'auto', car: car.id, on: !car.auto });
            onClose();
          }}
        >
          {car.auto ? 'Make this car\'s calls yourself again' : 'Let the team make this car\'s calls'}
        </button>
        <button type="button" class="button button--block button--quiet" onClick={onClose}>
          Close
        </button>
      </div>
    </Sheet>
  );
}
