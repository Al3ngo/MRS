import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { toast, updateCareer } from '../../app/session';
import { endTutorial, seeTip, type CareerState } from '../../game/career';
import { scrollStageTo, stageBox, stageScroll, stageSize } from '../stage';
import { nextTip, type Tip } from './tips';

/**
 * The tutorial's pop-up: the next unseen tip of a screen, with what it is about lit up and the
 * rest of the screen dimmed. Built on the browser's own <dialog>, so the screen behind cannot be
 * used until the tip is read (Escape counts as read). Render it with the screen's tips; it shows
 * nothing once the career has seen them, or skipped the tutorial.
 */
export function Coach({ career, tips }: { career: CareerState; tips: readonly Tip[] }) {
  const tip = nextTip(career, tips);
  if (!tip) return null;
  const left = tips.filter((entry) => !career.tutorial.seen.includes(entry.id)).length;
  return <CoachTip key={tip.id} tip={tip} last={left === 1} />;
}

interface Box {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/** Room around the lit-up part, and between it and the screen's edges. */
const AROUND = 6;
const EDGE = 8;
/** Below this much room beside the lit-up part, the tip sits at the foot of the screen instead. */
const ROOM = 170;

function CoachTip({ tip, last }: { tip: Tip; last: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  // Everything is measured on the stage (the game's landscape box), which is turned on the screen
  // when the phone is upright: see stage.ts.
  const [view, setView] = useState(stageSize);
  const card = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(220);
  useLayoutEffect(() => {
    const element = card.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setCardHeight(element.offsetHeight));
    observer.observe(element);
    setCardHeight(element.offsetHeight);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    // Escape closes the dialog; that counts as having read the tip.
    const cancel = (event: Event): void => {
      event.preventDefault();
      read();
    };
    element.addEventListener('cancel', cancel);
    return () => {
      element.removeEventListener('cancel', cancel);
      if (element.open) element.close();
    };
  }, []);

  // Find the part of the screen the tip is about, bring it into view, and keep its outline in step.
  useLayoutEffect(() => {
    const target = tip.target ? document.querySelector<HTMLElement>(tip.target) : null;
    if (target) {
      // Bring it into view: centred if it fits, from its top (below the top bar) if it is tall.
      const first = stageBox(target);
      const { height } = stageSize();
      if (first.top < 64 || first.bottom > height - 96) {
        const tall = first.bottom - first.top > height * 0.55;
        const offset = tall ? 72 : (height - (first.bottom - first.top)) / 2;
        scrollStageTo(stageScroll() + first.top - offset);
      }
    }
    const measure = (): void => {
      const size = stageSize();
      setView(size);
      if (!target?.isConnected) {
        setBox(null);
        return;
      }
      const rect = stageBox(target);
      if (rect.right - rect.left === 0 && rect.bottom - rect.top === 0) {
        setBox(null);
        return;
      }
      const seen = {
        top: Math.max(EDGE, rect.top - AROUND),
        left: Math.max(EDGE, rect.left - AROUND),
        right: Math.min(size.width - EDGE, rect.right + AROUND),
        bottom: Math.min(size.height - EDGE, rect.bottom + AROUND),
      };
      // Scrolled out of sight: the tip shows on its own, in the middle.
      setBox(seen.bottom - seen.top < 16 || seen.right - seen.left < 16 ? null : seen);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (target) observer.observe(target);
    observer.observe(document.documentElement);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [tip]);

  function read(): void {
    void updateCareer((current) => seeTip(current, tip.id));
  }
  function skip(): void {
    void updateCareer((current) => endTutorial(seeTip(current, tip.id)));
    toast('Tutorial off. It can be replayed from the settings.');
  }

  // The tip goes beside the lit-up part where there is room (on a screen held sideways, usually
  // to its left or right), else above or below it, else at the foot of the screen; there, the
  // ring stops short of it, around the part still in view above.
  const cardWidth = Math.min(380, view.width - 2 * EDGE * 2);
  const left = box ? box.left : 0;
  const right = box ? view.width - box.right : 0;
  const above = box ? box.top : 0;
  const below = box ? view.height - box.bottom : 0;
  const sideways = box !== null && Math.max(left, right) >= cardWidth + 24;
  const atFoot = box !== null && !sideways && Math.max(above, below) < Math.min(ROOM, cardHeight + 24);
  const middle = box ? Math.min(Math.max(EDGE * 2, (box.top + box.bottom) / 2 - cardHeight / 2), view.height - cardHeight - EDGE * 2) : 0;
  const place: Record<string, string> = !box
    ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    : sideways
      ? right >= left
        ? { top: `${middle}px`, left: `${box.right + 16}px` }
        : { top: `${middle}px`, left: `${box.left - 16 - cardWidth}px` }
      : atFoot
        ? { bottom: `${EDGE * 2}px`, left: '50%', transform: 'translateX(-50%)' }
        : below >= above
          ? { top: `${box.bottom + 12}px`, left: '50%', transform: 'translateX(-50%)' }
          : { bottom: `${view.height - box.top + 12}px`, left: '50%', transform: 'translateX(-50%)' };
  const ring = box && atFoot ? { ...box, bottom: Math.min(box.bottom, view.height - EDGE * 2 - cardHeight - 12) } : box;
  const lit = ring && ring.bottom - ring.top >= 24 ? ring : null;

  return (
    <dialog ref={dialog} class="coach" aria-labelledby={`tip-${tip.id}`}>
      <svg class="coach__shade" width={view.width} height={view.height} aria-hidden="true">
        <path
          fill-rule="evenodd"
          d={`M0 0H${view.width}V${view.height}H0Z${lit ? hole(lit) : ''}`}
        />
        {lit && (
          <rect
            class="coach__ring"
            x={lit.left}
            y={lit.top}
            width={lit.right - lit.left}
            height={lit.bottom - lit.top}
            rx={RADIUS}
          />
        )}
      </svg>
      <div class="coach__card" ref={card} style={{ ...place, width: `${cardWidth}px` }}>
        <p class="coach__kicker">Tutorial</p>
        <h2 class="coach__title" id={`tip-${tip.id}`}>
          {tip.title}
        </h2>
        {tip.lines.map((line) => (
          <p class="coach__text" key={line}>
            {line}
          </p>
        ))}
        <div class="coach__actions">
          <button type="button" class="button button--quiet" onClick={skip}>
            Skip the tutorial
          </button>
          <button type="button" class="button button--primary" autofocus onClick={read}>
            {last ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

const RADIUS = 14;

/** A rounded rectangle, drawn the other way round so that it cuts a hole in the shade. */
function hole({ top, left, right, bottom }: Box): string {
  const r = Math.min(RADIUS, (right - left) / 2, (bottom - top) / 2);
  return (
    `M${left + r} ${top}` +
    `A${r} ${r} 0 0 0 ${left} ${top + r}` +
    `V${bottom - r}` +
    `A${r} ${r} 0 0 0 ${left + r} ${bottom}` +
    `H${right - r}` +
    `A${r} ${r} 0 0 0 ${right} ${bottom - r}` +
    `V${top + r}` +
    `A${r} ${r} 0 0 0 ${right - r} ${top}` +
    'Z'
  );
}
