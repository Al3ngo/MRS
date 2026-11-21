import { useState } from 'preact/hooks';
import { useStore } from '../app/store';
import { askForMotion, motionAccess, view, viewSettings } from '../platform/orientation';

/**
 * While the game is turned and following the phone, an iPhone must first let it read the motion
 * sensor; it only asks when the player taps. This offers the tap, once a visit, until answered.
 */
export function MotionPrompt() {
  const { turn } = useStore(view);
  const { port } = useStore(viewSettings);
  const access = useStore(motionAccess);
  const [later, setLater] = useState(false);
  if (!turn || port !== 'auto' || access !== 'not-asked' || later) return null;
  return (
    <div class="motion-prompt" role="dialog" aria-label="Follow the phone">
      <p class="motion-prompt__text">Hold the phone either way round: the game can turn to match.</p>
      <button type="button" class="button button--primary motion-prompt__allow" onClick={() => void askForMotion()}>
        Allow
      </button>
      <button type="button" class="button button--quiet" onClick={() => setLater(true)}>
        Not now
      </button>
    </div>
  );
}
