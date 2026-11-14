/**
 * Getting a backup file out of the browser and back in.
 *
 * Both hand-offs must start inside the tap that asked for them, so each function here is synchronous
 * up to the browser call. Prepare the text first, then call these from the button's click handler.
 */

const SAVE_MIME = 'application/json';

function asFile(name: string, text: string): File {
  return new File([text], name, { type: SAVE_MIME });
}

/**
 * Whether the system share sheet will take a save file. On iPhone this is the dependable way to
 * put a file in the Files app from a home-screen app; Android and desktop do better with a download.
 */
export function canShareFile(name: string, text: string): boolean {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [asFile(name, text)] });
  } catch {
    return false;
  }
}

/** Opens the share sheet. Resolves true if shared, false if the player closed the sheet. */
export async function shareFile(name: string, text: string): Promise<boolean> {
  try {
    await navigator.share({ files: [asFile(name, text)], title: name });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    throw error;
  }
}

/** Saves the file through the browser's ordinary download. */
export function downloadFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: SAVE_MIME }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // The download reads the blob after the click returns; release it once that has surely happened.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

let abandonPendingPick: (() => void) | undefined;

/**
 * Opens the system file picker and resolves with the chosen file, or null if the player backed out.
 * Deliberately has no `accept` filter: iOS greys out files whose type it does not recognise, and a
 * save that travelled through a chat app can lose its type. A wrong file is caught when it is read.
 */
export function pickFile(): Promise<File | null> {
  // Older browsers never report a closed picker; settle any pick still hanging before starting another.
  abandonPendingPick?.();
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    abandonPendingPick = () => finish(null);
    document.body.appendChild(input);
    input.click();
  });
}
