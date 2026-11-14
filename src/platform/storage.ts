/**
 * How safe the saves are on this device. Browsers may clear a site's data when space runs low
 * unless the site has been granted "persistent" storage.
 */

export interface StorageReport {
  /** True: the browser will not clear saves on its own. False: it may. Null: it will not say. */
  persistent: boolean | null;
  /** Bytes this game is using on the device, when the browser reports it. */
  usedBytes: number | null;
}

export async function readStorage(): Promise<StorageReport> {
  const manager = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!manager) return { persistent: null, usedBytes: null };
  const [persistent, estimate] = await Promise.all([
    manager.persisted ? manager.persisted().catch(() => null) : Promise.resolve(null),
    manager.estimate ? manager.estimate().catch(() => null) : Promise.resolve(null),
  ]);
  return { persistent, usedBytes: estimate?.usage ?? null };
}

/**
 * Asks the browser to keep the saves for good. Some browsers decide silently (Chrome grants it to
 * installed or often-used apps), some ask the player (Firefox). Returns whether it is granted now.
 */
export async function requestPersistence(): Promise<boolean> {
  const manager = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!manager?.persist) return false;
  try {
    return (await manager.persisted()) || (await manager.persist());
  } catch {
    return false;
  }
}
