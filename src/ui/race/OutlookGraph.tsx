import type { CarOutlook } from '../../game/sim';
import { meterColour } from '../Meter';

/**
 * One car's tyres and fuel from now (left) to the flag (right): a slim bar for each lap, as full
 * and as green as the tyres or fuel will be then. A white line marks each planned stop, where the
 * tyres start again from new. Red at the bottom means it has run out.
 */
/** Three plain bands, so the graph reads at a glance: fine, getting low, out. */
const band = (good: number): string => meterColour(good > 0.5 ? 1 : good > 0.2 ? 0.5 : 0);

function Strip({ values, good, label }: { values: readonly number[]; good: readonly number[]; label: string }) {
  const count = Math.max(1, values.length);
  return (
    <svg class="outlook__strip" viewBox={`0 0 ${count} 10`} preserveAspectRatio="none" role="img" aria-label={label}>
      {values.map((value, lap) => {
        const height = value <= 0 ? 1.6 : Math.max(1.6, value * 10);
        return (
          <rect key={lap} x={lap} y={10 - height} width="1.04" height={height} fill={band(value <= 0 ? 0 : (good[lap] ?? value))} />
        );
      })}
    </svg>
  );
}

export function OutlookGraph({
  outlook,
  tyreColour,
  tyreWords,
  fuelWords,
}: {
  outlook: CarOutlook;
  tyreColour: string;
  tyreWords: string;
  fuelWords: string;
}) {
  const count = Math.max(1, outlook.tyres.length);
  return (
    <span class="outlook">
      <span class="outlook__row">
        <span class="outlook__label">
          <span class="tyre" style={{ background: tyreColour }} />
          Tyres
        </span>
        <Strip values={outlook.tyres} good={outlook.tyres} label={tyreWords} />
      </span>
      <span class="outlook__row">
        <span class="outlook__label">Fuel</span>
        <Strip values={outlook.fuel} good={outlook.fuelComfort} label={fuelWords} />
      </span>
      <span class="outlook__marks" aria-hidden="true">
        {outlook.stops.map((stop) => (
          <span key={stop} class="outlook__stop" style={{ left: `${(stop / count) * 100}%` }} />
        ))}
      </span>
    </span>
  );
}
