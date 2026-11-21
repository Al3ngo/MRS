/**
 * The stage: the landscape box the whole game is drawn in (#app). It is the size of the screen
 * held sideways; with the phone upright and the game turned (see platform/orientation.ts) it is
 * turned a quarter on the screen. Screens scroll inside it, not the page, and anything that
 * measures the screen measures the stage instead.
 */
import { view } from '../platform/orientation';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * A box measured on the screen (getBoundingClientRect), in the stage's own coordinates. Turned
 * 'right' (clockwise), the stage's top runs down the screen's right edge; turned 'left', down its
 * left edge. `screen` is the screen's size: the stage's height across, its width down.
 */
export function toStage(box: Box, turn: 'right' | 'left' | null, screen: { width: number; height: number }): Box {
  if (turn === 'right') {
    return { left: box.top, right: box.bottom, top: screen.width - box.right, bottom: screen.width - box.left };
  }
  if (turn === 'left') {
    return { left: screen.height - box.bottom, right: screen.height - box.top, top: box.left, bottom: box.right };
  }
  return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
}

const stage = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.getElementById('app'));

/** The element the screens scroll in. */
export const scroller = (): HTMLElement | null => (typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.scroller'));

/** The stage's size: the screen held sideways. */
export function stageSize(): { width: number; height: number } {
  const element = stage();
  if (element && element.clientWidth > 0) return { width: element.clientWidth, height: element.clientHeight };
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Where an element is on the stage. */
export function stageBox(element: Element): Box {
  const box = element.getBoundingClientRect();
  const turn = view.get().turn;
  // The screen's size as the stage was laid out for it: turned, the stage's height runs across it.
  const { width, height } = stageSize();
  return toStage(box, turn, turn ? { width: height, height: width } : { width, height });
}

/** Scrolls the screen to `top` (in stage pixels). */
export function scrollStageTo(top: number): void {
  const element = scroller();
  if (element) element.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  else window.scrollTo(0, Math.max(0, top));
}

/** How far the screen is scrolled. */
export const stageScroll = (): number => scroller()?.scrollTop ?? window.scrollY;
