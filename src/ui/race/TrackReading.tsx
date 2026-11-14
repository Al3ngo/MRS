import { Meter, wetMeter } from '../Meter';
import { trackWords } from './words';

/** "Track: [bar] Dry" — how wet the track is, as a bar and a word, inside a line of text. */
export function TrackReading({ wetness }: { wetness: number }) {
  const words = trackWords(wetness);
  return (
    <span class="reading">
      Track:
      <Meter {...wetMeter(wetness)} size="small" class="reading__bar" label={`Track: ${words.toLowerCase()}`} />
      <span aria-hidden="true">{words.toLowerCase()}.</span>
    </span>
  );
}
