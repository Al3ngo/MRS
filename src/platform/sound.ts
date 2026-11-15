/**
 * The game's sounds, all made in code with the browser's Web Audio API: nothing is downloaded, so
 * they work offline. Engines differ by era, as the real ones did:
 *
 *   - 2010-13: the 2.4-litre V8, revving to 18,000: a high, hard scream (firing at about 1,200 Hz).
 *   - 2014-25: the 1.6-litre turbo V6 hybrid, about 11,000 rpm: lower and muffled by the turbo,
 *     with its whistle on top.
 *   - 2026: the same size of engine, with half the car's power electric now: an electric whine
 *     over a duller engine note.
 *
 * Browsers allow sound only after the player has touched the screen or pressed a key, so the audio
 * starts on the first one. Volume and mute are kept on the device, apart from the careers.
 */
import { createStore } from '../app/store';

export interface SoundSettings {
  /** 0 to 1. */
  volume: number;
  muted: boolean;
}

const KEY = 'mrm-sound';
const DEFAULTS: SoundSettings = { volume: 0.7, muted: false };

function load(): SoundSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SoundSettings> | null;
    if (!stored) return DEFAULTS;
    return {
      volume: typeof stored.volume === 'number' && stored.volume >= 0 && stored.volume <= 1 ? stored.volume : DEFAULTS.volume,
      muted: typeof stored.muted === 'boolean' ? stored.muted : DEFAULTS.muted,
    };
  } catch {
    return DEFAULTS;
  }
}

export const soundSettings = createStore<SoundSettings>(typeof localStorage === 'undefined' ? DEFAULTS : load());

export function setSound(change: Partial<SoundSettings>): void {
  soundSettings.set((current) => ({ ...current, ...change }));
  try {
    localStorage.setItem(KEY, JSON.stringify(soundSettings.get()));
  } catch {
    // Private windows may refuse; the setting still holds until the page closes.
  }
  if (context && master) master.gain.setTargetAtTime(loudness(), context.currentTime, 0.03);
}

/** Volume to gain: the ear hears loudness roughly as the square. */
const loudness = (): number => {
  const { volume, muted } = soundSettings.get();
  return muted ? 0 : volume * volume;
};

// ── The audio graph ─────────────────────────────────────────────────────────────────────────

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
type SessionNavigator = Navigator & { audioSession?: { type: string } };

function startAudio(): void {
  if (!context) {
    const Maker = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Maker) return;
    try {
      // Mix with the player's music, and keep quiet when the phone is set to silent.
      const session = (navigator as SessionNavigator).audioSession;
      if (session) session.type = 'ambient';
    } catch {
      // Not offered by this browser.
    }
    context = new Maker({ latencyHint: 'interactive' });
    // Many cars at once must not clip: a gentle limiter before the speakers.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master = context.createGain();
    master.gain.value = loudness();
    master.connect(limiter).connect(context.destination);
    noiseBuffer = makeNoise(context);
  }
  if (context.state !== 'running' && document.visibilityState === 'visible') void context.resume().catch(() => undefined);
}

/** Starts listening for the first touch, and for button presses (each one clicks). Once, at boot. */
export function armSound(): void {
  for (const name of ['pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(name, startAudio, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (!context) return;
    if (document.visibilityState === 'hidden') void context.suspend().catch(() => undefined);
    else void context.resume().catch(() => undefined);
  });
  document.addEventListener(
    'click',
    (event) => {
      const control = (event.target as Element | null)?.closest?.('button, a[href]');
      if (control && !(control as HTMLButtonElement).disabled) uiClick();
    },
    { capture: true },
  );
}

/** The context, when sound can play now and is not muted; null otherwise, so nothing is built. */
function live(): { ctx: AudioContext; out: GainNode } | null {
  if (!context || !master || context.state !== 'running' || loudness() === 0) return null;
  return { ctx: context, out: master };
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // A fixed sequence, not Math.random: the same hiss every time.
  let seed = 0x9e3779b9;
  for (let i = 0; i < data.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

function noise(ctx: AudioContext, loop = false): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = loop;
  return source;
}

function filter(ctx: AudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

function gain(ctx: AudioContext, value: number): GainNode {
  const node = ctx.createGain();
  node.gain.value = value;
  return node;
}

/** A soft clipper: the rasp of an engine pushed hard. */
const shapes = new Map<number, Float32Array>();
function shaper(ctx: AudioContext, drive: number): WaveShaperNode {
  let curve = shapes.get(drive);
  if (!curve) {
    curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    shapes.set(drive, curve);
  }
  const node = ctx.createWaveShaper();
  node.curve = curve as Float32Array<ArrayBuffer>;
  node.oversample = '2x';
  return node;
}

/** Shapes over a sound's length, sampled for setValueCurveAtTime. */
function curve(points: number, at: (share: number) => number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(points);
  for (let i = 0; i < points; i++) out[i] = at(i / (points - 1));
  return out;
}

// ── Clicks ──────────────────────────────────────────────────────────────────────────────────

let lastClick = 0;

/** A short, soft tick for a button. */
export function uiClick(): void {
  const audio = live();
  if (!audio) return;
  const { ctx, out } = audio;
  const t = ctx.currentTime;
  if (t - lastClick < 0.04) return;
  lastClick = t;
  const tone = ctx.createOscillator();
  tone.type = 'triangle';
  tone.frequency.setValueAtTime(1800, t);
  tone.frequency.exponentialRampToValueAtTime(950, t + 0.035);
  const envelope = gain(ctx, 0.0001);
  envelope.gain.exponentialRampToValueAtTime(0.13, t + 0.003);
  envelope.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
  tone.connect(envelope).connect(out);
  tone.start(t);
  tone.stop(t + 0.07);
}

// ── Engines ─────────────────────────────────────────────────────────────────────────────────

export type EngineEra = 'v8' | 'hybrid' | 'hybrid-2026';

export const engineEra = (season: number): EngineEra => (season <= 2013 ? 'v8' : season <= 2025 ? 'hybrid' : 'hybrid-2026');

interface EngineVoice {
  /** The firing frequency at full revs, Hz. */
  pitch: number;
  /** The crankshaft's own beat, as a share of the pitch, and how strongly it roughens the note. */
  crank: number;
  rough: number;
  /** A tone an octave below: body. */
  body: number;
  /** How hard the note is driven into the clipper, and how much of the top end survives. */
  drive: number;
  bright: number;
  /** The turbo's whistle and the electric motor's whine, as shares of the engine note. */
  whistle: number;
  whine: number;
}

const ENGINES: Readonly<Record<EngineEra, EngineVoice>> = {
  // 18,000 rpm, eight cylinders: 1,200 firings a second; the crank turns at a quarter of that.
  v8: { pitch: 1150, crank: 0.25, rough: 0.3, body: 0.18, drive: 3.4, bright: 6500, whistle: 0, whine: 0 },
  // About 11,000 rpm, six cylinders: 550 firings a second; the crank turns at a third of that.
  hybrid: { pitch: 555, crank: 1 / 3, rough: 0.42, body: 0.38, drive: 2, bright: 2700, whistle: 0.07, whine: 0.02 },
  // The same engine, duller, under a motor's whine.
  'hybrid-2026': { pitch: 525, crank: 1 / 3, rough: 0.36, body: 0.3, drive: 1.6, bright: 2200, whistle: 0.035, whine: 0.11 },
};

/**
 * One engine as a set of nodes, every frequency scaled by `ratio` (1 is full revs). Returns the
 * output to connect, the sources to start and stop, and the params that carry the pitch.
 */
function engine(ctx: AudioContext, era: EngineEra, wobble = 1) {
  const voice = ENGINES[era];
  const pitch = voice.pitch * wobble;
  const sources: AudioScheduledSourceNode[] = [];
  const pitched: { param: AudioParam; base: number }[] = [];
  const tone = (type: OscillatorType, base: number): OscillatorNode => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = base;
    sources.push(osc);
    pitched.push({ param: osc.frequency, base });
    return osc;
  };

  const mix = gain(ctx, 0.5);
  tone('sawtooth', pitch).connect(mix);
  tone('sawtooth', pitch * 1.006).connect(gain(ctx, 0.45)).connect(mix);
  tone('square', pitch / 2).connect(gain(ctx, voice.body)).connect(mix);

  // The crank's beat, as a wobble in the loudness of the note: what makes it an engine, not a buzz.
  const beat = gain(ctx, 1 - voice.rough);
  const crank = tone('square', pitch * voice.crank);
  crank.connect(gain(ctx, voice.rough)).connect(beat.gain);
  mix.connect(beat);

  const top = filter(ctx, 'lowpass', voice.bright, 0.9);
  beat.connect(shaper(ctx, voice.drive)).connect(top);

  const output = gain(ctx, 1);
  top.connect(output);
  if (voice.whistle > 0) tone('sine', pitch * 6.3).connect(gain(ctx, voice.whistle)).connect(output);
  if (voice.whine > 0) {
    tone('sine', pitch * 3.6).connect(gain(ctx, voice.whine)).connect(output);
    tone('sine', pitch * 5.4).connect(gain(ctx, voice.whine * 0.5)).connect(output);
  }
  return { output, sources, pitched };
}

let voices = 0;
const MAX_VOICES = 6;

export interface PassBy {
  era: EngineEra;
  /** 0 to 1: how loud at its closest. */
  level: number;
  /** -1 or 1: which way across the speakers the car goes. */
  direction: number;
  /** How long it takes to go past, in seconds. */
  length: number;
  /** 0 to 1: spray from a wet track. */
  wet: number;
  /** Shifts the engine's note a little, so no two cars sound quite alike. */
  wobble?: number;
  /** Always heard, even when many cars are passing at once (the player's own). */
  priority?: boolean;
}

/** A car going past the pit wall: rising, then falling, as it passes (the Doppler effect). */
export function passBy({ era, level, direction, length, wet, wobble = 1, priority = false }: PassBy): void {
  const audio = live();
  if (!audio || voices >= (priority ? MAX_VOICES + 2 : MAX_VOICES)) return;
  const { ctx, out } = audio;
  const t = ctx.currentTime + 0.01;
  const { output, sources, pitched } = engine(ctx, era, wobble);

  // Higher as it comes, lower as it goes: about 12% either way at racing speed.
  const doppler = curve(48, (s) => 1 + 0.12 * -Math.tanh((s - 0.5) / 0.09));
  for (const { param, base } of pitched) {
    param.setValueCurveAtTime(curve(48, (s) => base * doppler[Math.round(s * 47)]!), t, length);
  }

  // Loudest as it passes, fading with distance either side.
  const envelope = gain(ctx, 0);
  envelope.gain.setValueCurveAtTime(
    curve(64, (s) => (level * 0.55 * Math.sqrt(Math.sin(Math.PI * s))) / (1 + ((s - 0.5) / 0.14) ** 2)),
    t,
    length,
  );
  const pan = ctx.createStereoPanner();
  pan.pan.setValueCurveAtTime(curve(32, (s) => direction * 0.8 * Math.tanh((s - 0.5) / 0.16)), t, length);
  output.connect(envelope).connect(pan).connect(out);

  if (wet > 0.05) {
    const spray = noise(ctx);
    const band = filter(ctx, 'bandpass', 2600, 0.6);
    const sprayLevel = gain(ctx, 0);
    sprayLevel.gain.setValueCurveAtTime(
      curve(32, (s) => (wet * level * 0.5 * Math.sin(Math.PI * s)) / (1 + ((s - 0.5) / 0.2) ** 2)),
      t,
      length,
    );
    spray.connect(band).connect(sprayLevel).connect(pan);
    sources.push(spray);
  }

  voices += 1;
  for (const source of sources) {
    source.start(t);
    source.stop(t + length + 0.05);
  }
  sources[0]!.onended = () => {
    voices -= 1;
    pan.disconnect();
  };
}

/** Lights out: the whole field's engines rising together. */
export function launch(era: EngineEra): void {
  const audio = live();
  if (!audio) return;
  const { ctx, out } = audio;
  const t = ctx.currentTime + 0.01;
  const length = 2.6;
  const sources: AudioScheduledSourceNode[] = [];
  const bus = gain(ctx, 0);
  bus.gain.setValueCurveAtTime(curve(32, (s) => 0.5 * Math.min(1, s * 5) * (1 - s) ** 1.5), t, length);
  bus.connect(out);
  for (const wobble of [0.97, 1, 1.025]) {
    const { output, sources: own, pitched } = engine(ctx, era, wobble);
    for (const { param, base } of pitched) param.setValueCurveAtTime(curve(24, (s) => base * (0.55 + 0.45 * Math.sqrt(s))), t, length);
    const pan = ctx.createStereoPanner();
    pan.pan.value = (wobble - 1) * 20;
    output.connect(gain(ctx, 0.4)).connect(pan).connect(bus);
    sources.push(...own);
  }
  const roar = noise(ctx);
  roar.connect(filter(ctx, 'lowpass', 500)).connect(gain(ctx, 0.5)).connect(bus);
  sources.push(roar);
  for (const source of sources) {
    source.start(t);
    source.stop(t + length + 0.05);
  }
}

// ── Pit stops and crashes ───────────────────────────────────────────────────────────────────

let lastStop = 0;

/** A pit stop: the wheel guns off, the wheel guns on, and away. */
export function pitStop(level = 1): void {
  const audio = live();
  if (!audio || audio.ctx.currentTime - lastStop < 0.6) return;
  const { ctx, out } = audio;
  lastStop = ctx.currentTime;
  const t = ctx.currentTime + 0.02;
  const sources: AudioScheduledSourceNode[] = [];
  // Four guns at once, a little apart; then again once the new wheels are on.
  [0, 0.62].forEach((volley) => {
    for (let wheel = 0; wheel < 4; wheel++) {
      const start = t + volley + wheel * 0.035;
      const gun = noise(ctx);
      const band = filter(ctx, 'bandpass', 2100 + wheel * 260, 2.2);
      const rattle = gain(ctx, 0);
      // The gun's ratchet: about 45 hammer blows a second for a fifth of a second.
      for (let blow = 0; blow < 9; blow++) {
        const at = start + blow / 45;
        rattle.gain.setValueAtTime(level * 0.45, at);
        rattle.gain.setValueAtTime(0, at + 0.011);
      }
      const pan = ctx.createStereoPanner();
      pan.pan.value = (wheel % 2 === 0 ? -1 : 1) * 0.45;
      gun.connect(band).connect(rattle).connect(pan).connect(out);
      sources.push(gun);
      gun.start(start, wheel * 0.3);
      gun.stop(start + 0.24);
    }
  });
}

let lastCrash = 0;

/** A car into the barriers (or two cars into each other): a thump, a crunch and debris. */
export function crash(level = 1): void {
  const audio = live();
  if (!audio || audio.ctx.currentTime - lastCrash < 0.35) return;
  const { ctx, out } = audio;
  lastCrash = ctx.currentTime;
  const t = ctx.currentTime + 0.01;

  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(110, t);
  thump.frequency.exponentialRampToValueAtTime(32, t + 0.4);
  const thumpLevel = gain(ctx, 0.0001);
  thumpLevel.gain.exponentialRampToValueAtTime(level * 0.9, t + 0.008);
  thumpLevel.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  thump.connect(thumpLevel).connect(out);

  const crunch = noise(ctx);
  const crunchTone = filter(ctx, 'lowpass', 1600, 0.8);
  crunchTone.frequency.setValueAtTime(2400, t);
  crunchTone.frequency.exponentialRampToValueAtTime(300, t + 0.6);
  const crunchLevel = gain(ctx, 0.0001);
  crunchLevel.gain.exponentialRampToValueAtTime(level * 0.7, t + 0.01);
  crunchLevel.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  crunch.connect(crunchTone).connect(crunchLevel).connect(out);

  // Pieces skittering away: short bright ticks, thinning out.
  const debris = noise(ctx);
  const bright = filter(ctx, 'highpass', 3800);
  const ticks = gain(ctx, 0);
  for (let i = 0; i < 14; i++) {
    const at = t + 0.08 + i * 0.05 + ((i * 37) % 11) / 400;
    ticks.gain.setValueAtTime(level * 0.35 * (1 - i / 16), at);
    ticks.gain.setValueAtTime(0, at + 0.012);
  }
  debris.connect(bright).connect(ticks).connect(out);

  thump.start(t);
  thump.stop(t + 0.55);
  crunch.start(t, 0.5);
  crunch.stop(t + 0.75);
  debris.start(t, 1.1);
  debris.stop(t + 0.9);
}

// ── Around the circuit: the field in the distance, and the rain ──────────────────────────────

export interface Ambience {
  /**
   * `running`: the race is going (not paused, not over). `field`: the share of the cars still
   * racing. `slow`: behind a safety car. `rain`: 0 to 1, how hard it is raining.
   */
  update(now: { running: boolean; field: number; slow: boolean; rain: number }): void;
  stop(): void;
}

/** The sound of the circuit: engines on the far side, rising and falling, and rain when it falls. */
export function ambience(era: EngineEra): Ambience {
  let built: { ctx: AudioContext; bed: GainNode; rain: GainNode; pitched: { param: AudioParam; base: number }[]; stop: () => void } | null = null;

  const build = (): typeof built => {
    const audio = live();
    if (!audio) return null;
    const { ctx, out } = audio;
    const sources: AudioScheduledSourceNode[] = [];
    // The far side: two engines, heard through the distance (only the low end carries).
    const bed = gain(ctx, 0);
    const far = filter(ctx, 'lowpass', 620, 0.6);
    far.connect(bed).connect(out);
    const pitched: { param: AudioParam; base: number }[] = [];
    for (const wobble of [0.8, 0.63]) {
      const voice = engine(ctx, era, wobble);
      voice.output.connect(gain(ctx, 0.5)).connect(far);
      sources.push(...voice.sources);
      pitched.push(...voice.pitched);
      // Cars braking and accelerating out of sight: the note slowly rising and falling.
      const swing = ctx.createOscillator();
      swing.frequency.value = wobble === 0.8 ? 0.21 : 0.33;
      for (const entry of voice.pitched) swing.connect(gain(ctx, entry.base * 0.07)).connect(entry.param);
      sources.push(swing);
    }
    const rumble = noise(ctx, true);
    rumble.connect(filter(ctx, 'lowpass', 260)).connect(gain(ctx, 0.6)).connect(bed);
    sources.push(rumble);

    // Rain: a broad hiss.
    const rain = gain(ctx, 0);
    const drops = noise(ctx, true);
    drops.connect(filter(ctx, 'highpass', 1100)).connect(filter(ctx, 'lowpass', 7500)).connect(rain).connect(out);
    sources.push(drops);

    for (const source of sources) source.start();
    return {
      ctx,
      bed,
      rain,
      pitched,
      stop: () => {
        const t = ctx.currentTime;
        bed.gain.setTargetAtTime(0, t, 0.15);
        rain.gain.setTargetAtTime(0, t, 0.15);
        for (const source of sources) source.stop(t + 0.8);
      },
    };
  };

  return {
    update({ running, field, slow, rain }) {
      if (!built && running) built = build();
      if (!built) return;
      const { ctx, bed, rain: rainLevel, pitched } = built;
      const t = ctx.currentTime;
      bed.gain.setTargetAtTime(running ? 0.16 * field * (slow ? 0.55 : 1) : 0, t, 0.25);
      rainLevel.gain.setTargetAtTime(running ? 0.2 * Math.min(1, rain) : 0, t, 0.4);
      for (const { param, base } of pitched) param.setTargetAtTime(base * (slow ? 0.72 : 1), t, 0.6);
    },
    stop() {
      built?.stop();
      built = null;
    },
  };
}
