/**
 * The backup file: one career as a small JSON document the player can keep outside the browser.
 * Pure text in, text out; storage and file pickers live elsewhere.
 */
import type { CareerState } from '../game/career';
import { SaveError, gameCodec, type SaveCodec } from '../game/save-schema';

export const SAVE_FORMAT = 'modern-racing-manager-save';

/** Larger than any real save by a wide margin; stops a wrong file from freezing the phone. */
export const MAX_SAVE_FILE_BYTES = 25 * 1024 * 1024;

interface SaveFileShape {
  format: typeof SAVE_FORMAT;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  savedAt: string;
  /** "crc32:" + 8 hex digits, over JSON.stringify(career). */
  checksum: string;
  career: unknown;
}

let crcTable: Uint32Array | undefined;

/** CRC-32 (IEEE) of a string's UTF-8 bytes, as 8 hex digits. Catches damage, not tampering. */
export function crc32(text: string): string {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  const table = crcTable;
  const bytes = new TextEncoder().encode(text);
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (table[(crc ^ (bytes[i] as number)) & 0xff] as number) ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

const checksumOf = (career: unknown): string => `crc32:${crc32(JSON.stringify(career))}`;

export interface EncodeInput {
  /** The career exactly as stored; it may be from an older schema version. */
  career: unknown;
  schemaVersion: number;
  savedAt: string;
  appVersion: string;
  exportedAt: Date;
}

export function encodeSaveFile(input: EncodeInput): string {
  const file: SaveFileShape = {
    format: SAVE_FORMAT,
    schemaVersion: input.schemaVersion,
    appVersion: input.appVersion,
    exportedAt: input.exportedAt.toISOString(),
    savedAt: input.savedAt,
    checksum: checksumOf(input.career),
    career: input.career,
  };
  return JSON.stringify(file);
}

export interface DecodedSave {
  career: CareerState;
  /** When the career was last saved in the game it came from, if the file says. */
  savedAt: string | null;
  /**
   * 'verified': the contents match the stamp written at export.
   * 'unverified': the file was edited, damaged in transit, or carries no stamp. It still loaded
   * and passed every check; the player decides whether to trust it.
   */
  integrity: 'verified' | 'unverified';
}

/** Reads a backup file. Throws SaveError when it cannot be used at all. */
export function decodeSaveFile(text: string, codec: SaveCodec = gameCodec): DecodedSave {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new SaveError('not-json', 'This file is not a save: it could not be read as JSON.', [], { cause });
  }
  if (typeof parsed !== 'object' || parsed === null || (parsed as { format?: unknown }).format !== SAVE_FORMAT) {
    throw new SaveError('not-a-save', 'This file is not a Modern Racing Manager save.');
  }
  const file = parsed as Partial<SaveFileShape>;
  if (typeof file.schemaVersion !== 'number' || !('career' in file)) {
    throw new SaveError('not-a-save', 'This save file is missing its contents.');
  }

  // Stamp first: it covers the career exactly as it sits in the file, before any upgrade touches it.
  const integrity = file.checksum === checksumOf(file.career) ? 'verified' : 'unverified';
  const career = codec.upgrade(file.career, file.schemaVersion);
  const savedAt = typeof file.savedAt === 'string' && !Number.isNaN(Date.parse(file.savedAt)) ? file.savedAt : null;
  return { career, savedAt, integrity };
}

const two = (n: number): string => String(n).padStart(2, '0');

/**
 * A file name that sorts by career position and then by time: mrm-2014-r05-20261112-1850.json.
 * Without a known position (a save this build cannot read) it is mrm-save-20261112-1850.json.
 */
export function saveFileName(position: { seasonYear: number; round: number } | null, at: Date): string {
  const stamp = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}-${two(at.getHours())}${two(at.getMinutes())}`;
  const where = position ? `${position.seasonYear}-r${two(position.round)}` : 'save';
  return `mrm-${where}-${stamp}.json`;
}
