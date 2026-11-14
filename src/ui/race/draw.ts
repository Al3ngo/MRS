/**
 * Draws the race from above: the circuit as one thick line, each car a dot in its team's colour.
 * Flat shapes only. Called every frame, so it allocates nothing it can keep.
 */
import { drawX, drawY, placeOnTrack, type Fit, type TrackMap, type TrackPoint } from './track';

export interface CarMark {
  /** Position in laps, already smoothed between simulation steps. */
  lap: number;
  colour: string;
  code: string;
  /** One of the player's cars: drawn larger, ringed and named. */
  mine: boolean;
  /** In the pit lane: drawn beside the track. */
  pit: boolean;
  /** Not on the circuit: retired or finished. */
  gone: boolean;
}

export interface Scene {
  cars: readonly CarMark[];
  /** The safety car's position in laps, or null when it is not out. */
  safetyCar: number | null;
  /** 0 dry to 1 flooded: the track darkens to blue as it gets wetter. */
  wetness: number;
  caution: 'none' | 'yellow' | 'red';
}

const GROUND = '#000000';
const TRACK = [42, 42, 42] as const;
const WET_TRACK = [34, 62, 98] as const;
const PIT_LANE = '#1c1c1c';
const LINE = '#ffffff';
const YELLOW = '#e5a93b';
const RED = '#e5484d';
const FIGURES = "600 12px 'Barlow Condensed', 'Inter', sans-serif";

const spot: TrackPoint = { x: 0, y: 0, nx: 0, ny: 0 };

/** The circuit's line as a path, for the current fit. Built once per size, not per frame. */
export function trackPath(map: TrackMap, fit: Fit): Path2D {
  const path = new Path2D();
  for (let i = 0; i < map.count; i++) {
    const x = drawX(fit, map.points[i * 2]!, map.points[i * 2 + 1]!);
    const y = drawY(fit, map.points[i * 2]!, map.points[i * 2 + 1]!);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

/** Across-track direction on the drawing, from the map's own. */
const acrossX = (fit: Fit, point: TrackPoint): number => (fit.turned ? point.ny : point.nx);
const acrossY = (fit: Fit, point: TrackPoint): number => (fit.turned ? point.nx : -point.ny);

export function drawScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  map: TrackMap,
  fit: Fit,
  path: Path2D,
  scene: Scene,
): void {
  context.fillStyle = GROUND;
  context.fillRect(0, 0, width, height);

  // The pit lane: a thin line inside the first part of the lap.
  context.strokeStyle = PIT_LANE;
  context.lineWidth = 3;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  for (let i = 0; i <= 12; i++) {
    placeOnTrack(map, -0.012 + (i / 12) * 0.055, spot);
    const x = drawX(fit, spot.x, spot.y) + acrossX(fit, spot) * 11;
    const y = drawY(fit, spot.x, spot.y) + acrossY(fit, spot) * 11;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();

  const wet = Math.min(1, scene.wetness * 1.6);
  const mix = (dry: number, soaked: number): number => Math.round(dry + (soaked - dry) * wet);
  context.strokeStyle = `rgb(${mix(TRACK[0], WET_TRACK[0])}, ${mix(TRACK[1], WET_TRACK[1])}, ${mix(TRACK[2], WET_TRACK[2])})`;
  context.lineWidth = 9;
  context.stroke(path);
  if (scene.caution !== 'none') {
    context.strokeStyle = scene.caution === 'red' ? RED : YELLOW;
    context.lineWidth = 1.5;
    context.stroke(path);
  }

  // The start line.
  placeOnTrack(map, 0, spot);
  const startX = drawX(fit, spot.x, spot.y);
  const startY = drawY(fit, spot.x, spot.y);
  context.strokeStyle = LINE;
  context.lineWidth = 2;
  context.lineCap = 'butt';
  context.beginPath();
  context.moveTo(startX - acrossX(fit, spot) * 7, startY - acrossY(fit, spot) * 7);
  context.lineTo(startX + acrossX(fit, spot) * 7, startY + acrossY(fit, spot) * 7);
  context.stroke();

  // Cars: the back of the field first, so the leaders sit on top; the player's cars last of all.
  context.font = FIGURES;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (let layer = 0; layer < 2; layer++) {
    for (let i = scene.cars.length - 1; i >= 0; i--) {
      const car = scene.cars[i]!;
      if (car.gone || car.mine !== (layer === 1)) continue;
      placeOnTrack(map, car.lap, spot);
      const side = car.pit ? 11 : 0;
      const x = drawX(fit, spot.x, spot.y) + acrossX(fit, spot) * side;
      const y = drawY(fit, spot.x, spot.y) + acrossY(fit, spot) * side;
      if (car.mine) {
        context.fillStyle = LINE;
        context.beginPath();
        context.arc(x, y, 7.5, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = car.colour;
      context.beginPath();
      context.arc(x, y, car.mine ? 5.5 : car.pit ? 3.5 : 4.5, 0, Math.PI * 2);
      context.fill();
      if (car.mine) {
        // The name sits outside the lap, clear of the pit lane.
        const labelX = Math.min(width - 16, Math.max(16, x - acrossX(fit, spot) * 20));
        const labelY = Math.min(height - 9, Math.max(9, y - acrossY(fit, spot) * 16));
        context.fillStyle = GROUND;
        context.fillRect(labelX - 15, labelY - 8, 30, 16);
        context.fillStyle = LINE;
        context.fillText(car.code, labelX, labelY + 1);
      }
    }
  }

  if (scene.safetyCar !== null) {
    placeOnTrack(map, scene.safetyCar, spot);
    const x = drawX(fit, spot.x, spot.y);
    const y = drawY(fit, spot.x, spot.y);
    context.fillStyle = YELLOW;
    context.beginPath();
    context.arc(x, y, 5.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = GROUND;
    context.font = "700 8px 'Inter', sans-serif";
    context.fillText('SC', x, y + 0.5);
    context.font = FIGURES;
  }
}
