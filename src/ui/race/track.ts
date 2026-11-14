/**
 * A circuit as the race view needs it: where a car is on the drawing, given how far round the lap
 * it is.
 *
 * The simulation measures a car's progress as a share of the lap's time. A car does not cover the
 * lap at an even speed, so the map works out how fast the circuit lets a car go at each point
 * (slow where it turns sharply, with room to brake before and accelerate after) and from that,
 * where a car is after any share of a lap. Cars then bunch into corners and stretch out on the
 * straights, as they do.
 *
 * No drawing happens here: this is geometry, and it is tested.
 */

export interface TrackMap {
  /** Points along the centre line, evenly spaced, as x,y pairs in metres (east, north). */
  points: Float32Array;
  count: number;
  /** Lap length in metres, as drawn. */
  length: number;
  /** For each point, the share of the lap's time gone when a car reaches it. One more entry than points: the last is 1. */
  time: Float32Array;
  /** Speed at each point in metres a second: for reference and for tests. */
  speed: Float32Array;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Whether the lap runs clockwise seen from above. */
  clockwise: boolean;
}

export interface TrackPoint {
  x: number;
  y: number;
  /** A unit vector across the track, pointing to the inside of the lap. */
  nx: number;
  ny: number;
}

/** What a car can do, near enough: top speed, cornering grip, acceleration and braking. */
const TOP_SPEED = 88;
const SLOWEST = 16;
const CORNERING = 34;
const ACCELERATION = 11;
const BRAKING = 38;

export function trackMap(outline: readonly number[]): TrackMap {
  const corners = outline.length / 2;
  // Distance along the outline to each of its points, the closing side included.
  const along = new Float64Array(corners + 1);
  for (let i = 0; i < corners; i++) {
    const j = (i + 1) % corners;
    along[i + 1] = along[i]! + Math.hypot(outline[j * 2]! - outline[i * 2]!, outline[j * 2 + 1]! - outline[i * 2 + 1]!);
  }
  const length = along[corners]!;

  // Evenly spaced points, about every 12 metres.
  const count = Math.min(720, Math.max(160, Math.round(length / 12)));
  const points = new Float32Array(count * 2);
  let side = 0;
  for (let i = 0; i < count; i++) {
    const at = (i / count) * length;
    while (side < corners - 1 && along[side + 1]! < at) side++;
    const next = (side + 1) % corners;
    const span = along[side + 1]! - along[side]!;
    const t = span > 0 ? (at - along[side]!) / span : 0;
    points[i * 2] = outline[side * 2]! + (outline[next * 2]! - outline[side * 2]!) * t;
    points[i * 2 + 1] = outline[side * 2 + 1]! + (outline[next * 2 + 1]! - outline[side * 2 + 1]!) * t;
  }
  const step = length / count;

  // How fast each point can be taken: from how sharply the line turns there.
  const speed = new Float32Array(count);
  const reach = 3;
  for (let i = 0; i < count; i++) {
    const a = ((i - reach + count) % count) * 2;
    const b = i * 2;
    const c = ((i + reach) % count) * 2;
    const ab = Math.hypot(points[b]! - points[a]!, points[b + 1]! - points[a + 1]!);
    const bc = Math.hypot(points[c]! - points[b]!, points[c + 1]! - points[b + 1]!);
    const ca = Math.hypot(points[a]! - points[c]!, points[a + 1]! - points[c + 1]!);
    const cross = Math.abs(
      (points[b]! - points[a]!) * (points[c + 1]! - points[a + 1]!) - (points[b + 1]! - points[a + 1]!) * (points[c]! - points[a]!),
    );
    const curvature = ab * bc * ca > 0 ? (2 * cross) / (ab * bc * ca) : 0;
    speed[i] = Math.max(SLOWEST, Math.min(TOP_SPEED, curvature > 0 ? Math.sqrt(CORNERING / curvature) : TOP_SPEED));
  }
  // A car cannot gain or lose speed at will: twice round each way settles the closed lap.
  for (let pass = 0; pass < 2 * count; pass++) {
    const i = pass % count;
    const next = (i + 1) % count;
    speed[next] = Math.min(speed[next]!, Math.sqrt(speed[i]! * speed[i]! + 2 * ACCELERATION * step));
  }
  for (let pass = 2 * count; pass > 0; pass--) {
    const i = pass % count;
    const before = (i - 1 + count) % count;
    speed[before] = Math.min(speed[before]!, Math.sqrt(speed[i]! * speed[i]! + 2 * BRAKING * step));
  }

  const time = new Float32Array(count + 1);
  let total = 0;
  for (let i = 0; i < count; i++) {
    time[i] = total;
    total += step / ((speed[i]! + speed[(i + 1) % count]!) / 2);
  }
  for (let i = 0; i < count; i++) time[i] = time[i]! / total;
  time[count] = 1;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let area = 0;
  for (let i = 0; i < count; i++) {
    const x = points[i * 2]!;
    const y = points[i * 2 + 1]!;
    const j = ((i + 1) % count) * 2;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    area += x * points[j + 1]! - points[j]! * y;
  }
  return { points, count, length, time, speed, minX, maxX, minY, maxY, clockwise: area < 0 };
}

/**
 * Where a car is, `lap` laps into the race (only the part after the decimal point matters).
 * Fills and returns `out`, so that drawing sixty times a second makes no garbage.
 */
export function placeOnTrack(map: TrackMap, lap: number, out: TrackPoint): TrackPoint {
  const share = lap - Math.floor(lap);
  const { time, points, count } = map;
  let low = 0;
  let high = count;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (time[middle]! <= share) low = middle;
    else high = middle;
  }
  const span = time[low + 1]! - time[low]!;
  const t = span > 0 ? (share - time[low]!) / span : 0;
  const a = low * 2;
  const b = ((low + 1) % count) * 2;
  const dx = points[b]! - points[a]!;
  const dy = points[b + 1]! - points[a + 1]!;
  const size = Math.hypot(dx, dy) || 1;
  out.x = points[a]! + dx * t;
  out.y = points[a + 1]! + dy * t;
  // Inside is to the right of travel on a clockwise lap, to the left on an anticlockwise one.
  const turn = map.clockwise ? 1 : -1;
  out.nx = (dy / size) * turn;
  out.ny = (-dx / size) * turn;
  return out;
}

export interface Fit {
  scale: number;
  /** Whether the drawing is turned a quarter to make better use of the space. */
  turned: boolean;
  /** Adds to a scaled, turned point to place it. */
  offsetX: number;
  offsetY: number;
}

/**
 * How to fit a circuit into a box of the given size, leaving `pad` clear all round. A circuit that
 * is taller than it is wide is turned on its side when that lets it be drawn larger.
 */
export function fitTrack(map: TrackMap, width: number, height: number, pad: number): Fit {
  const spanX = map.maxX - map.minX;
  const spanY = map.maxY - map.minY;
  const room = (across: number, down: number): number =>
    Math.min((width - 2 * pad) / Math.max(across, 1), (height - 2 * pad) / Math.max(down, 1));
  const upright = room(spanX, spanY);
  const sideways = room(spanY, spanX);
  const turned = sideways > upright * 1.15;
  const scale = turned ? sideways : upright;
  const midX = (map.minX + map.maxX) / 2;
  const midY = (map.minY + map.maxY) / 2;
  // Upright: east is right and north is up. Turned: north is right and east is down.
  return turned
    ? { scale, turned, offsetX: width / 2 - midY * scale, offsetY: height / 2 - midX * scale }
    : { scale, turned, offsetX: width / 2 - midX * scale, offsetY: height / 2 + midY * scale };
}

/** A point in metres as a point on the drawing. */
export const drawX = (fit: Fit, x: number, y: number): number => fit.offsetX + (fit.turned ? y : x) * fit.scale;
export const drawY = (fit: Fit, x: number, y: number): number =>
  fit.turned ? fit.offsetY + x * fit.scale : fit.offsetY - y * fit.scale;
