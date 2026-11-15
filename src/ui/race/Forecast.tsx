import { weatherForecast, type ForecastKind, type RaceState } from '../../game/sim';
import { Meter, wetMeter } from '../Meter';
import { WeatherIcon } from './WeatherIcon';
import { trackWords } from './words';

const KIND_WORDS: Readonly<Record<ForecastKind, string>> = {
  dry: 'dry',
  cloud: 'cloudy',
  'light-rain': 'light rain',
  'heavy-rain': 'heavy rain',
};

/** The track now, and the weather for the next few laps: an icon and the chance of rain for each. */
export function Forecast({
  state,
  laps = 5,
  inCard = false,
  layout = 'top',
}: {
  state: RaceState;
  laps?: number;
  inCard?: boolean;
  /** Over the map: a strip along the top, or the track on the left and the laps down the right. */
  layout?: 'top' | 'sides';
}) {
  const forecast = weatherForecast(state, laps);
  const words = trackWords(state.wetness);
  return (
    <div class={`forecast${inCard ? ' forecast--card' : ''}${layout === 'sides' ? ' forecast--sides' : ''}`}>
      <span class="forecast__track">
        <span class="forecast__label">Track</span>
        <Meter {...wetMeter(state.wetness)} size="small" class="forecast__wet" label={`Track: ${words.toLowerCase()}`} />
        <span>{words}</span>
      </span>
      {forecast.length > 0 && (
        <ol class="forecast__laps" aria-label="Weather for the coming laps">
          {forecast.map((lap) => (
            <li
              key={lap.lap}
              class="forecast__lap"
              aria-label={`Lap ${lap.lap}: ${KIND_WORDS[lap.kind]}, ${Math.round(lap.chance * 100)}% chance of rain`}
            >
              <WeatherIcon kind={lap.kind} />
              <span class="forecast__chance figure">{Math.round(lap.chance * 100)}%</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
