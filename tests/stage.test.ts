import { describe, expect, it } from 'vitest';
import { screenSize, sideFromGravity, viewFor } from '../src/platform/orientation';
import { toStage } from '../src/ui/stage';

/** A phone held upright: 390 across, 844 down. The stage is 844 across, 390 down. */
const screen = { width: 390, height: 844 };

/**
 * Where a point of the stage lands on the screen, by the same transforms as the styles:
 * turned right, translateX(100vw) rotate(90deg); turned left, translateY(100dvh) rotate(-90deg).
 */
const onScreen = (x: number, y: number, turn: 'right' | 'left'): [number, number] =>
  turn === 'right' ? [screen.width - y, x] : [y, screen.height - x];

describe('the turned stage', () => {
  it('maps a box on the screen back to where it is on the stage, either way round', () => {
    for (const turn of ['right', 'left'] as const) {
      // A box on the stage: 100 to 300 across, 40 to 90 down.
      const corners = [onScreen(100, 40, turn), onScreen(300, 90, turn)];
      const xs = corners.map(([x]) => x);
      const ys = corners.map(([, y]) => y);
      const box = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
      expect(toStage(box, turn, screen), turn).toEqual({ left: 100, right: 300, top: 40, bottom: 90 });
    }
  });

  it('leaves a box alone when the game is not turned', () => {
    const box = { left: 1, top: 2, right: 3, bottom: 4 };
    expect(toStage(box, null, screen)).toEqual(box);
  });

  it('turns the game, or asks for the phone to be turned, only when the phone is upright', () => {
    expect(viewFor(false, { upright: 'turn', port: 'right', lastSide: 'right' })).toEqual({ upright: false, turn: null, asking: false });
    expect(viewFor(true, { upright: 'turn', port: 'right', lastSide: 'left' })).toEqual({ upright: true, turn: 'right', asking: false });
    expect(viewFor(true, { upright: 'turn', port: 'left', lastSide: 'right' })).toEqual({ upright: true, turn: 'left', asking: false });
    expect(viewFor(true, { upright: 'ask', port: 'left', lastSide: 'right' })).toEqual({ upright: true, turn: null, asking: true });
    // Following the phone: the way it was last found held.
    expect(viewFor(true, { upright: 'turn', port: 'auto', lastSide: 'left' })).toEqual({ upright: true, turn: 'left', asking: false });
  });

  it('tells which way round the phone is held from the motion sensor, on an iPhone and by the standard', () => {
    // By the standard, the axis pointing up reads +9.8. Port on the right: the screen's right edge (+x) is up.
    expect(sideFromGravity({ x: 9.8, y: 0.5, z: 1 }, false)).toBe('right');
    expect(sideFromGravity({ x: -9.6, y: -1, z: 0.8 }, false)).toBe('left');
    // An iPhone reads every axis the other way round.
    expect(sideFromGravity({ x: -9.8, y: 0.5, z: 1 }, true)).toBe('right');
    expect(sideFromGravity({ x: 9.6, y: -1, z: 0.8 }, true)).toBe('left');
    // No call when it cannot tell: lying flat, held upright, half way round, or shaken about.
    expect(sideFromGravity({ x: 1, y: 0.5, z: 9.7 }, false)).toBeNull();
    expect(sideFromGravity({ x: 1, y: 9.7, z: 1 }, false)).toBeNull();
    expect(sideFromGravity({ x: 6.5, y: 6.9, z: 1 }, false)).toBeNull();
    expect(sideFromGravity({ x: 1, y: 1, z: 1 }, false)).toBeNull();
  });

  it('trusts the screen’s own size over a viewport short by a status bar, but not by more', () => {
    // An iPhone 16 Pro from its home screen: the viewport reported 62 points short.
    expect(screenSize({ width: 402, height: 812 }, { width: 402, height: 874 })).toEqual({ width: 402, height: 874 });
    // Held sideways, the same in the other direction.
    expect(screenSize({ width: 812, height: 402 }, { width: 402, height: 874 })).toEqual({ width: 874, height: 402 });
    // An iPad window in split view is much smaller than its screen: the window wins.
    expect(screenSize({ width: 500, height: 1000 }, { width: 1024, height: 1366 })).toEqual({ width: 500, height: 1000 });
    // In a browser tab (no screen size given), the measured viewport stands.
    expect(screenSize({ width: 390, height: 700 }, null)).toEqual({ width: 390, height: 700 });
  });
});

describe('a finger on the turned game', () => {
  it('moves in the game’s own directions', async () => {
    const { gameDelta } = await import('../src/ui/turnedScroll');
    // Turned right, the game's top is at the screen's right edge: a finger moving right moves up the game.
    expect(gameDelta(10, 0, 'right')).toEqual({ x: 0, y: -10 });
    expect(gameDelta(0, 10, 'right')).toEqual({ x: 10, y: -0 });
    // Turned left, the game's top is at the screen's left edge: a finger moving left moves up the game.
    expect(gameDelta(-10, 0, 'left')).toEqual({ x: -0, y: -10 });
    expect(gameDelta(0, 10, 'left')).toEqual({ x: -10, y: 0 });
  });
});
