/**
 * Scrolling with a finger while the game is turned (the phone upright, the game drawn a quarter
 * turn round: see platform/orientation.ts and stage.ts).
 *
 * Browsers are unreliable at scrolling a turned box by touch: some scroll it the screen's way
 * rather than the game's, some not at all. So while the game is turned, the game scrolls itself:
 * a finger dragged up the game (as the phone is held) scrolls the list under it, with the same
 * glide afterwards as a native scroll. Taps are left alone; so is a drag that starts on a slider.
 */
import { view } from '../platform/orientation';

/** How far a finger moves before it counts as a drag, not a tap, in pixels. */
const SLOP = 6;
/** The glide after letting go: how much speed is kept each millisecond, and when it stops. */
const KEEP_PER_MS = 0.9965;
const STOP_SPEED = 0.02;

/** A finger's movement on the screen, in the game's own directions: down the game is positive y. */
export function gameDelta(dx: number, dy: number, turn: 'right' | 'left'): { x: number; y: number } {
  // Turned right, the game's top runs down the screen's right edge: down the game is leftwards.
  return turn === 'right' ? { x: dy, y: -dx } : { x: -dy, y: dx };
}

/** The nearest box under `start` that can scroll up or down, from the inside out. */
function scrollables(start: Element | null): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (let element = start; element && element !== document.documentElement; element = element.parentElement) {
    if (!(element instanceof HTMLElement)) continue;
    const overflow = getComputedStyle(element).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && element.scrollHeight > element.clientHeight + 1) found.push(element);
  }
  return found;
}

/** Scrolls the first box that still has room in that direction; returns whether one did. */
function scrollBy(boxes: readonly HTMLElement[], amount: number): boolean {
  for (const box of boxes) {
    const before = box.scrollTop;
    box.scrollTop = before + amount;
    if (box.scrollTop !== before) return true;
  }
  return false;
}

export function followTurnedTouches(): void {
  let boxes: HTMLElement[] = [];
  let last: { x: number; y: number; t: number } | null = null;
  let dragging = false;
  let moved = 0;
  let speed = 0;
  let glide = 0;
  const stopGlide = (): void => {
    if (glide) cancelAnimationFrame(glide);
    glide = 0;
  };

  document.addEventListener(
    'touchstart',
    (event) => {
      stopGlide();
      const turn = view.get().turn;
      const touch = event.touches[0];
      if (!turn || !touch || event.touches.length > 1) {
        last = null;
        return;
      }
      const target = event.target as Element | null;
      if (target?.closest('input[type="range"]')) {
        last = null;
        return;
      }
      boxes = scrollables(target);
      last = { x: touch.clientX, y: touch.clientY, t: event.timeStamp };
      dragging = false;
      moved = 0;
      speed = 0;
    },
    { passive: true, capture: true },
  );

  document.addEventListener(
    'touchmove',
    (event) => {
      const turn = view.get().turn;
      const touch = event.touches[0];
      if (!turn || !last || !touch) return;
      const step = gameDelta(touch.clientX - last.x, touch.clientY - last.y, turn);
      moved += Math.hypot(step.x, step.y);
      if (!dragging && moved < SLOP) return;
      dragging = true;
      // The game scrolls; the browser does not.
      if (event.cancelable) event.preventDefault();
      const dt = Math.max(1, event.timeStamp - last.t);
      // The list follows the finger: dragging up the game scrolls further down it.
      scrollBy(boxes, -step.y);
      speed = 0.8 * (-step.y / dt) + 0.2 * speed;
      last = { x: touch.clientX, y: touch.clientY, t: event.timeStamp };
    },
    { passive: false, capture: true },
  );

  const release = (): void => {
    if (!dragging || Math.abs(speed) < STOP_SPEED) {
      last = null;
      return;
    }
    let previous = performance.now();
    const step = (now: number): void => {
      const dt = Math.min(48, now - previous);
      previous = now;
      speed *= KEEP_PER_MS ** dt;
      if (Math.abs(speed) < STOP_SPEED || !scrollBy(boxes, speed * dt)) {
        glide = 0;
        return;
      }
      glide = requestAnimationFrame(step);
    };
    glide = requestAnimationFrame(step);
    last = null;
  };
  document.addEventListener('touchend', release, { capture: true });
  document.addEventListener('touchcancel', release, { capture: true });

  // A mouse wheel (a desktop window taller than it is wide): down the wheel is down the game.
  document.addEventListener(
    'wheel',
    (event) => {
      if (!view.get().turn) return;
      const boxes = scrollables(event.target as Element | null);
      if (boxes.length === 0) return;
      event.preventDefault();
      scrollBy(boxes, event.deltaY || event.deltaX);
    },
    { passive: false, capture: true },
  );
}
