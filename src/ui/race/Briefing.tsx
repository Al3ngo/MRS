import type { CircuitTraits } from '../../game/data';
import { circuit as circuitById } from '../../game/data';
import { raceWeather, type ForecastKind, type RaceState } from '../../game/sim';
import type { Challenge, SponsorDeal } from '../../game/team';
import { challengeWords, cash, targetWords } from '../career/businessWords';
import { Meter, wetMeter } from '../Meter';
import { TrackOutline } from '../TrackOutline';
import { WeatherIcon } from './WeatherIcon';
import { trackWords } from './words';

/**
 * The briefing before the lights, after qualifying: the circuit drawn large, the sponsor's
 * challenge, and what the race holds (the circuit's character, the laps, the tyres on offer and
 * the weather for its start, middle and end).
 */

const KIND_WORDS: Readonly<Record<ForecastKind, string>> = {
  dry: 'Dry',
  cloud: 'Cloudy',
  'light-rain': 'Light rain',
  'heavy-rain': 'Heavy rain',
};

const PART_NAMES = ['Start', 'Middle', 'End'];

/** What stands out about a circuit, in a few plain words each. */
export function circuitCharacter(traits: CircuitTraits): string[] {
  const out: string[] = [];
  if (traits.power >= 4) out.push('Long straights: power counts');
  if (traits.downforce >= 4) out.push('Twisty: cornering grip counts');
  if (traits.tyreWear >= 4) out.push('Hard on tyres');
  if (traits.tyreWear <= 1) out.push('Easy on tyres');
  if (traits.overtaking <= 2) out.push('Hard to overtake');
  if (traits.overtaking >= 5) out.push('Easy to overtake');
  if (traits.safetyCar >= 0.5) out.push('Safety cars likely');
  if (traits.rain >= 0.3) out.push('Often wet');
  if (traits.danger >= 4) out.push('Walls close by: mistakes cost dear');
  return out.length > 0 ? out : ['An all-rounder: nothing stands out'];
}

export function Briefing({
  state,
  sponsor,
  challenge,
  sureness = 0.5,
}: {
  state: RaceState;
  /** The team's title sponsor, if it has one. */
  sponsor?: SponsorDeal | null;
  /** The challenge taken on for this race, if any. */
  challenge?: Challenge | null;
  /** The strategist's sureness, for the forecast. */
  sureness?: number;
}) {
  const { setup } = state;
  const venue = circuitById(setup.circuit);
  const weather = raceWeather(state, 3, sureness);
  const words = trackWords(state.wetness);
  return (
    <div class="stack briefing">
      <div class="briefing__map" aria-hidden="true">
        <TrackOutline circuit={venue} stroke={2.4} />
      </div>

      {setup.kind === 'race' && sponsor && (
        <section class="card" aria-labelledby="briefing-sponsor">
          <h2 class="card__title" id="briefing-sponsor">
            Sponsor challenge
          </h2>
          {challenge ? (
            <p class="briefing__challenge">
              <span>{challengeWords(challenge, setup.season)}</span>
              <span class="figure briefing__reward">+{cash(challenge.reward)}</span>
            </p>
          ) : (
            <p class="muted">None taken on for this race.</p>
          )}
          <p class="muted">
            {sponsor.name} also pays {cash(sponsor.bonus)} for {targetWords(sponsor.target)}.
          </p>
        </section>
      )}

      <section class="card" aria-labelledby="briefing-race">
        <h2 class="card__title" id="briefing-race">
          The {setup.kind === 'sprint' ? 'sprint' : 'race'}
        </h2>
        <ul class="briefing__traits" aria-label="What stands out about the circuit">
          {circuitCharacter(setup.traits).map((line) => (
            <li class="trait" key={line}>
              {line}
            </li>
          ))}
        </ul>
        <dl class="facts facts--tight">
          <div class="row">
            <dt class="row__label">Laps</dt>
            <dd class="row__value figure briefing__figure">{setup.laps}</dd>
          </div>
          <div class="row row--meter">
            <dt class="row__label">Track now</dt>
            <dd class="row__value row__value--meter">
              <Meter {...wetMeter(state.wetness)} size="small" label={`Track: ${words.toLowerCase()}`} />
              <span>{words}</span>
            </dd>
          </div>
        </dl>
        <h3 class="card__subtitle">Tyres</h3>
        <div class="compounds briefing__tyres" aria-label="Tyres for this race">
          {setup.compounds.map((tyre) => (
            <span class="compound" key={tyre.id}>
              <span class="compound__ring" style={{ borderColor: tyre.colour }} />
              {tyre.name}
            </span>
          ))}
        </div>
        <h3 class="card__subtitle">Forecast</h3>
        <ol class="briefing__weather" aria-label="Weather for the race">
          {weather.map((part, index) => (
            <li
              class="briefing__part"
              key={part.from}
              aria-label={`${PART_NAMES[index] ?? `Part ${index + 1}`}, laps ${part.from} to ${part.to}: ${KIND_WORDS[part.kind].toLowerCase()}, ${Math.round(part.chance * 100)}% chance of rain`}
            >
              <WeatherIcon kind={part.kind} />
              <span class="briefing__part-name">{PART_NAMES[index] ?? `Part ${index + 1}`}</span>
              <span class="briefing__part-chance figure">{Math.round(part.chance * 100)}%</span>
            </li>
          ))}
        </ol>
        <p class="muted">The chance of rain at the start, middle and end of the race. Further off, it is less sure.</p>
      </section>
    </div>
  );
}
