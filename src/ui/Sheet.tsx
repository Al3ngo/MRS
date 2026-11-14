import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';

interface SheetProps {
  title: string;
  /**
   * Where focus goes when the sheet opens. By default the title, so a tall sheet opens at its top;
   * false leaves it to the sheet's own `autofocus` control (a confirmation's safe choice).
   */
  focusTitle?: boolean;
  /** Called when the sheet has closed for any reason: a button, the backdrop, Escape, the back gesture. */
  onClose: () => void;
  children: ComponentChildren;
}

/**
 * A modal panel. Render it to open it; stop rendering it to close it. Built on the browser's own
 * <dialog>, which traps focus, closes on Escape and gives focus back to whatever opened it.
 */
export function Sheet({ title, focusTitle = true, onClose, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closed = useRef(onClose);
  closed.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const handleClose = () => closed.current();
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('close', handleClose);
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      class="sheet"
      aria-labelledby={titleId}
      // A tap that lands on the dialog itself, not its contents, is a tap on the backdrop.
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
    >
      <div class="sheet__body">
        <h2 class="sheet__title" id={titleId} tabIndex={focusTitle ? -1 : undefined} autofocus={focusTitle}>
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

interface ConfirmSheetProps {
  title: string;
  /** What will happen, one paragraph per entry. */
  lines: readonly string[];
  confirmLabel: string;
  cancelLabel?: string;
  /** 'danger' for actions that destroy something. */
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmSheet({
  title,
  lines,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  return (
    <Sheet title={title} focusTitle={false} onClose={onCancel}>
      {lines.map((line) => (
        <p class="sheet__text selectable" key={line}>
          {line}
        </p>
      ))}
      <div class="sheet__actions">
        <button
          type="button"
          class={`button button--block ${tone === 'danger' ? 'button--danger' : 'button--primary'}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        {/* Focus starts on the safe choice, so a stray Enter never confirms. */}
        <button type="button" class="button button--block button--secondary" autofocus onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </Sheet>
  );
}
