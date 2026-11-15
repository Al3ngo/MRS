/**
 * The game's logic stays apart from its screens, so the screens can be redesigned without touching
 * the race engine or the career. Everything under src/game is plain logic: it never imports from
 * the screens, the app or the browser layer, never touches browser objects, and never reads the
 * clock or unseeded randomness (which would make races impossible to repeat).
 */
import { describe, expect, it } from 'vitest';

/** Every source file of the game layer, as text. */
const raw = import.meta.glob<string>('../src/game/**/*.ts', { query: '?raw', import: 'default', eager: true });

describe('the game layer', () => {
  const sources = Object.entries(raw).map(([path, text]) => ({ path: path.replace('../src/game/', ''), text }));

  it('has files to check', () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it('never imports screens, the app, the browser layer or a UI library', () => {
    for (const { path, text } of sources) {
      const imports = [...text.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
      for (const target of imports) {
        expect(/(^|\/)(ui|app|platform)(\/|$)/.test(target), `${path} imports ${target}`).toBe(false);
        expect(/^preact/.test(target), `${path} imports ${target}`).toBe(false);
      }
    }
  });

  it('never touches the browser, the clock or unseeded randomness', () => {
    // Comments may mention these; code may not.
    const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const { path, text } of sources) {
      const body = code(text);
      for (const banned of ['document.', 'window.', 'localStorage', 'indexedDB', 'navigator.', 'Math.random', 'Date.now', 'performance.now']) {
        expect(body.includes(banned), `${path} uses ${banned}`).toBe(false);
      }
    }
  });
});
