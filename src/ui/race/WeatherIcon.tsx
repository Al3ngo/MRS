import type { ForecastKind } from '../../game/sim';

const SUN = '#f2c94c';
const DROP = '#4d8fe0';
const CLOUD = 'M6 14.5h8.2a3.3 3.3 0 0 0 .3-6.6 4.6 4.6 0 0 0-8.9 1.2A2.7 2.7 0 0 0 6 14.5Z';

/** A weather symbol, drawn for the game: dry (sun), cloud, light rain, heavy rain. */
export function WeatherIcon({ kind }: { kind: ForecastKind }) {
  if (kind === 'dry') {
    const rays = [0, 45, 90, 135, 180, 225, 270, 315];
    return (
      <svg class="weather-icon" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="3.6" fill={SUN} />
        {rays.map((angle) => (
          <line
            key={angle}
            x1={10 + 5.6 * Math.cos((angle * Math.PI) / 180)}
            y1={10 + 5.6 * Math.sin((angle * Math.PI) / 180)}
            x2={10 + 7.6 * Math.cos((angle * Math.PI) / 180)}
            y2={10 + 7.6 * Math.sin((angle * Math.PI) / 180)}
            stroke={SUN}
            stroke-width="1.5"
            stroke-linecap="round"
          />
        ))}
      </svg>
    );
  }
  const drops = kind === 'light-rain' ? [8, 12] : kind === 'heavy-rain' ? [6.5, 10, 13.5] : [];
  return (
    <svg class="weather-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d={CLOUD} transform={drops.length ? 'translate(0 -2.5)' : undefined} fill="var(--muted)" />
      {drops.map((x) => (
        <line key={x} x1={x} y1="14.5" x2={x - 1.2} y2={kind === 'heavy-rain' ? 18.5 : 17.5} stroke={DROP} stroke-width="1.6" stroke-linecap="round" />
      ))}
    </svg>
  );
}
