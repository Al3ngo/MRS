import { render } from 'preact';
import { startRouter } from './app/router';
import { boot, startAutosaveOnHide } from './app/session';
import { startInstallWatch, startOffline } from './platform/pwa';
import { watchOrientation } from './platform/orientation';
import { armSound } from './platform/sound';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';
import { App } from './ui/App';
import { followTurnedTouches } from './ui/turnedScroll';

// Design-check builds only (`vite build --mode inspect`): `?scene=three` stages the save slots first.
if (import.meta.env.MODE === 'inspect') {
  const scene = new URLSearchParams(location.search).get('scene');
  if (scene) await (await import('./dev/scenes')).applyScene(scene);
}

startRouter();
startInstallWatch();
startAutosaveOnHide();
armSound();
watchOrientation();
followTurnedTouches();
void startOffline();
void boot();

const host = document.getElementById('app');
if (!host) throw new Error('index.html has no #app element');
render(<App />, host);
