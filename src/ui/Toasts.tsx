import { dismissToast, toasts } from '../app/session';
import { useStore } from '../app/store';

/** Brief messages at the bottom of the screen. `aboveBar` lifts them clear of a pinned action bar. */
export function Toasts({ aboveBar }: { aboveBar: boolean }) {
  const list = useStore(toasts);
  return (
    <div class={`toasts${aboveBar ? ' toasts--above-bar' : ''}`} role="status" aria-live="polite">
      {list.map((item) => (
        <button
          type="button"
          key={item.id}
          class={`toast${item.tone === 'problem' ? ' toast--problem' : ''}`}
          onClick={() => dismissToast(item.id)}
        >
          {item.text}
        </button>
      ))}
    </div>
  );
}
