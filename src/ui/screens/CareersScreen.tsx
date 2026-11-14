import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { navigate } from '../../app/router';
import {
  app,
  boot,
  continueCareer,
  deleteCareer,
  explain,
  importCareer,
  prepareBackup,
  readBackup,
  restoreSafetyCopy,
  startCareer,
  toast,
  updateNow,
  type PreparedBackup,
} from '../../app/session';
import { useStore } from '../../app/store';
import { canShareFile, downloadFile, pickFile, shareFile } from '../../platform/files';
import { offline } from '../../platform/pwa';
import type { DecodedSave } from '../../platform/savefile';
import type { SlotId, SlotView } from '../../platform/saves';
import { summarise } from '../../game/career';
import { EraStrip } from '../EraStrip';
import { describePosition, formatBytes, formatWhen, PHASE_NAMES, roundLabel } from '../format';
import { IconForward, IconMore } from '../icons';
import { Mark } from '../Mark';
import { ConfirmSheet, Sheet } from '../Sheet';

/** A backup that has been read and is waiting for the player's go-ahead. */
interface PendingImport {
  slot: SlotId;
  backup: DecodedSave;
  replaces: SlotView;
}

const OFFLINE_LINES = {
  ready: 'Ready to play offline.',
  preparing: 'Downloading the game for offline play. Stay online for a moment.',
  failed: 'The offline download did not finish. Open System to try again.',
  unsupported: 'Offline play is not available in this browser window.',
} as const;

export function CareersScreen() {
  const { boot: bootState, bootError, slots } = useStore(app);
  const net = useStore(offline);

  const [busySlot, setBusySlot] = useState<SlotId | null>(null);
  const [menuFor, setMenuFor] = useState<SlotView | null>(null);
  const [deleting, setDeleting] = useState<SlotView | null>(null);
  const [backup, setBackup] = useState<PreparedBackup | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [working, setWorking] = useState(false);

  /** Runs a slot action, showing any failure as a message instead of losing it. */
  async function run(slot: SlotId, action: () => Promise<void>) {
    setBusySlot(slot);
    try {
      await action();
    } catch (error) {
      toast(explain(error), 'problem');
    } finally {
      setBusySlot(null);
    }
  }

  // The file picker has to open inside the tap itself, so nothing may be awaited before pickFile().
  async function restoreFromFile(view: SlotView) {
    // While a sheet is open the page behind it does not respond, and the picker's input lives there.
    document.querySelector<HTMLDialogElement>('dialog[open]')?.close();
    const picked = pickFile();
    setMenuFor(null);
    const file = await picked;
    if (!file) return;
    try {
      const read = await readBackup(file);
      if (view.kind === 'empty' && read.integrity === 'verified') {
        await importCareer(view.slot, read);
        toast(`Career restored to slot ${view.slot}.`);
      } else {
        setPendingImport({ slot: view.slot, backup: read, replaces: view });
      }
    } catch (error) {
      toast(explain(error), 'problem');
    }
  }

  async function confirmImport() {
    if (!pendingImport) return;
    setWorking(true);
    try {
      await importCareer(pendingImport.slot, pendingImport.backup);
      toast(`Career restored to slot ${pendingImport.slot}.`);
    } catch (error) {
      toast(explain(error), 'problem');
    } finally {
      setWorking(false);
      setPendingImport(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setWorking(true);
    try {
      await deleteCareer(deleting.slot);
      toast(`Slot ${deleting.slot} is empty.`);
    } catch (error) {
      toast(explain(error), 'problem');
    } finally {
      setWorking(false);
      setDeleting(null);
    }
  }

  async function openBackup(view: SlotView) {
    setMenuFor(null);
    try {
      setBackup(await prepareBackup(view.slot));
    } catch (error) {
      toast(explain(error), 'problem');
    }
  }

  // One main action on the screen: carry on with the career played last, or start the first one.
  const careers = slots.filter((view) => view.kind === 'career');
  const latest = careers.reduce<SlotView | null>(
    (best, view) =>
      view.kind === 'career' && (!best || best.kind !== 'career' || view.record.savedAt > best.record.savedAt)
        ? view
        : best,
    null,
  );
  const leadSlot = latest?.slot ?? slots.find((view) => view.kind === 'empty')?.slot ?? null;

  return (
    <div class="shell">
      <header class="topbar">
        <div class="topbar__inner">
          <div class="brand">
            <Mark />
            <span class="brand__name">Modern Racing Manager</span>
          </div>
          <button type="button" class="button button--quiet" onClick={() => navigate({ screen: 'system' })}>
            System
          </button>
        </div>
      </header>

      <main class="canvas">
        <div class="title-row">
          <h1 class="title">Careers</h1>
          <p class="subtitle">{OFFLINE_LINES[net.status]}</p>
        </div>

        {net.updateWaiting && (
          <div class="update-row card">
            <p>A new version of the game is ready.</p>
            <button type="button" class="button button--secondary" onClick={() => void updateNow()}>
              Update now
            </button>
          </div>
        )}

        {bootState === 'failed' && (
          <div class="card stack">
            <p class="card__title">Saves are not available</p>
            <p class="muted selectable">{bootError}</p>
            <div>
              <button type="button" class="button button--secondary" onClick={() => void boot()}>
                Try again
              </button>
            </div>
          </div>
        )}

        {bootState === 'ready' && (
          <ul class="slots">
            {slots.map((view) => (
              <li key={view.slot}>
                <SlotCard
                  view={view}
                  lead={view.slot === leadSlot}
                  busy={busySlot === view.slot}
                  onContinue={() => run(view.slot, () => continueCareer(view.slot))}
                  onStart={() => run(view.slot, () => startCareer(view.slot))}
                  onRestoreFile={() => void restoreFromFile(view)}
                  onRestoreSafetyCopy={() =>
                    run(view.slot, async () => {
                      await restoreSafetyCopy(view.slot);
                      toast(`Slot ${view.slot} is back on its last good save.`);
                    })
                  }
                  onMenu={() => setMenuFor(view)}
                />
              </li>
            ))}
          </ul>
        )}

        {/* STAGE 2 BENCH: a way in to the season data until the game's own screens show it. */}
        <button type="button" class="card bench-link" onClick={() => navigate({ screen: 'almanac', season: 2010 })}>
          <span class="slot__lines">
            <span class="slot__line">Season almanac</span>
            <span class="slot__next">Every calendar, team, driver and rule change, 2010 to 2026</span>
          </span>
          <IconForward />
        </button>
      </main>

      {menuFor && menuFor.kind !== 'empty' && (
        <Sheet
          title={`Slot ${menuFor.slot}${menuFor.record.summary ? `: ${describePosition(menuFor.record.summary)}` : ''}`}
          onClose={() => setMenuFor(null)}
        >
          <div class="menu">
            <button type="button" class="menu__item" onClick={() => void openBackup(menuFor)}>
              <span class="menu__label">Back up to a file</span>
              <span class="menu__hint">Keep a copy outside this browser</span>
            </button>
            <button type="button" class="menu__item" onClick={() => void restoreFromFile(menuFor)}>
              <span class="menu__label">Replace with a backup file</span>
              <span class="menu__hint">Load a career you saved earlier into this slot</span>
            </button>
            <button
              type="button"
              class="menu__item menu__item--danger"
              onClick={() => {
                setDeleting(menuFor);
                setMenuFor(null);
              }}
            >
              <span class="menu__label">Delete career</span>
              <span class="menu__hint">Empty this slot for a new playthrough</span>
            </button>
          </div>
          <div class="sheet__actions">
            <button type="button" class="button button--block button--secondary" onClick={() => setMenuFor(null)}>
              Close
            </button>
          </div>
        </Sheet>
      )}

      {deleting && deleting.kind !== 'empty' && (
        <ConfirmSheet
          title={`Delete the career in slot ${deleting.slot}?`}
          lines={[
            deleting.record.summary
              ? `It is in ${describePosition(deleting.record.summary)}, last saved ${formatWhen(deleting.record.savedAt)}.`
              : `It was last saved ${formatWhen(deleting.record.savedAt)}.`,
            'This cannot be undone. Back it up to a file first if you might want it again.',
          ]}
          confirmLabel="Delete career"
          cancelLabel="Keep it"
          tone="danger"
          busy={working}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}

      {pendingImport && (
        <ConfirmSheet
          title={
            pendingImport.replaces.kind === 'empty'
              ? `Restore this backup to slot ${pendingImport.slot}?`
              : `Replace the career in slot ${pendingImport.slot}?`
          }
          lines={importLines(pendingImport)}
          confirmLabel={pendingImport.replaces.kind === 'empty' ? 'Restore backup' : 'Replace career'}
          tone={pendingImport.replaces.kind === 'empty' ? 'primary' : 'danger'}
          busy={working}
          onConfirm={() => void confirmImport()}
          onCancel={() => setPendingImport(null)}
        />
      )}

      {backup && <BackupSheet backup={backup} onClose={() => setBackup(null)} />}
    </div>
  );
}

function importLines({ backup, replaces }: PendingImport): string[] {
  const lines: string[] = [];
  const saved = backup.savedAt ? `, saved ${formatWhen(backup.savedAt)}` : '';
  lines.push(`The backup holds a career in ${describePosition(summarise(backup.career))}${saved}.`);
  if (replaces.kind !== 'empty') {
    lines.push(
      replaces.record.summary
        ? `Slot ${replaces.slot} holds a career in ${describePosition(replaces.record.summary)}. It will be gone for good.`
        : `The career now in slot ${replaces.slot} will be gone for good.`,
    );
  }
  if (backup.integrity === 'unverified') {
    lines.push(
      'This file was edited or damaged after it was exported, so it could not be verified. It does pass the game’s own checks.',
    );
  }
  return lines;
}

interface SlotCardProps {
  view: SlotView;
  /** Carries the screen's one main action. */
  lead: boolean;
  busy: boolean;
  onContinue: () => void;
  onStart: () => void;
  onRestoreFile: () => void;
  onRestoreSafetyCopy: () => void;
  onMenu: () => void;
}

function SlotCard({ view, lead, busy, onContinue, onStart, onRestoreFile, onRestoreSafetyCopy, onMenu }: SlotCardProps) {
  const leadClass = lead ? ' slot--lead' : '';
  const menuButton = (
    <button type="button" class="icon-button slot__more" aria-label={`More for slot ${view.slot}`} onClick={onMenu}>
      <IconMore />
    </button>
  );

  /**
   * The card's one action. The whole row is the button, so it is an easy target for a thumb; the
   * pill inside it is what says so. `spoken` is the full description for screen readers.
   */
  const action = (label: string, spoken: string, onClick: () => void, content: ComponentChildren) => (
    <button type="button" class="slot__main" disabled={busy} aria-label={spoken} onClick={onClick}>
      {content}
      <span class={`button slot__go ${lead ? 'button--primary' : 'button--secondary'}`}>
        <span class="slot__go-label">{label}</span>
        <IconForward />
      </span>
    </button>
  );

  if (view.kind === 'empty') {
    return (
      <article class={`card slot slot--empty${leadClass}`} aria-label={`Slot ${view.slot}, empty`}>
        <header class="slot__head">
          <span>Slot {view.slot}</span>
          <button type="button" class="button button--quiet slot__restore" onClick={onRestoreFile}>
            Restore backup
          </button>
        </header>
        {action(
          'New career',
          `New career in slot ${view.slot}`,
          onStart,
          <span class="slot__lines">
            <span class="slot__line">No career yet</span>
            <span class="slot__next">Starts in 2010</span>
          </span>,
        )}
        <EraStrip summary={null} />
      </article>
    );
  }

  const { record } = view;
  const head = (
    <header class="slot__head">
      <span>
        Slot {view.slot} · Saved {formatWhen(record.savedAt)}
      </span>
      {menuButton}
    </header>
  );

  if (view.kind === 'newer') {
    return (
      <article class="card slot slot--stuck" aria-label={`Slot ${view.slot}, saved by a newer version`}>
        {head}
        <div class="slot__main">
          <span class="slot__lines">
            <span class="slot__line">Saved by a newer version</span>
            <span class="slot__next">Update the game to carry on with this career.</span>
          </span>
        </div>
      </article>
    );
  }

  if (view.kind === 'damaged') {
    const lines = (
      <span class="slot__lines">
        <span class="slot__line">This save is damaged</span>
        <span class="slot__next">
          {record.hasSafetyCopy
            ? 'The save before it is kept as a safety copy.'
            : 'Restore a backup file, or delete it to free the slot.'}
        </span>
      </span>
    );
    return (
      <article class="card slot slot--stuck" aria-label={`Slot ${view.slot}, damaged save`}>
        {head}
        {record.hasSafetyCopy ? (
          action('Use safety copy', `Use safety copy for slot ${view.slot}`, onRestoreSafetyCopy, lines)
        ) : (
          <div class="slot__main">{lines}</div>
        )}
      </article>
    );
  }

  const summary = record.summary;
  if (!summary) return null;
  const label = summary.finished ? 'Open' : 'Continue';

  return (
    <article class={`card slot${leadClass}`} aria-label={`Slot ${view.slot}, ${describePosition(summary)}`}>
      {head}
      {action(
        label,
        `${label} the career in slot ${view.slot}: ${describePosition(summary)}`,
        onContinue,
        <span class="slot__where">
          <span class="figure slot__season">{summary.seasonYear}</span>
          <span class="slot__lines">
            <span class="slot__line">{summary.finished ? 'Career complete' : roundLabel(summary)}</span>
            <span class="slot__next">
              {summary.finished ? 'All 17 seasons run' : `${PHASE_NAMES[summary.phase]} next`}
            </span>
          </span>
        </span>,
      )}
      <EraStrip summary={summary} />
    </article>
  );
}

function BackupSheet({ backup, onClose }: { backup: PreparedBackup; onClose: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  const shareable = canShareFile(backup.name, backup.text);

  // Both hand-offs must begin inside the tap, so nothing is awaited before them.
  function download() {
    downloadFile(backup.name, backup.text);
    onClose();
    toast('Backup file downloaded.');
  }

  async function share() {
    try {
      if (await shareFile(backup.name, backup.text)) {
        onClose();
        toast('Backup shared.');
      }
    } catch {
      setProblem('Sharing did not work here. Use Download instead.');
    }
  }

  return (
    <Sheet title={`Back up slot ${backup.slot}`} onClose={onClose}>
      <p class="sheet__text">
        Keep this file somewhere outside the browser: the Files app, a cloud drive, a message to yourself. Any slot can
        be restored from it later.
      </p>
      <p class="backup-file selectable">
        <span class="backup-file__name">{backup.name}</span>
        <span class="backup-file__size">{formatBytes(backup.bytes)} · JSON</span>
      </p>
      {problem && <p class="notice notice--problem">{problem}</p>}
      <div class="sheet__actions">
        {shareable ? (
          <>
            <button type="button" class="button button--block button--primary" onClick={() => void share()}>
              Share or save to Files
            </button>
            <button type="button" class="button button--block button--secondary" onClick={download}>
              Download
            </button>
          </>
        ) : (
          <button type="button" class="button button--block button--primary" onClick={download}>
            Download backup
          </button>
        )}
        <button type="button" class="button button--block button--quiet" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
