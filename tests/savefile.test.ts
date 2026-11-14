import { describe, expect, it } from 'vitest';
import { completeSession, newCareer } from '../src/game/career';
import { SCHEMA_VERSION, SaveError } from '../src/game/save-schema';
import { SAVE_FORMAT, crc32, decodeSaveFile, encodeSaveFile, saveFileName } from '../src/platform/savefile';

const career = () => completeSession(completeSession(newCareer('career-1', new Date('2026-11-12T18:00:00Z'))));

const encode = (overrides: Partial<Parameters<typeof encodeSaveFile>[0]> = {}) =>
  encodeSaveFile({
    career: career(),
    schemaVersion: SCHEMA_VERSION,
    savedAt: '2026-11-12T18:42:00.000Z',
    appVersion: '0.1.0',
    exportedAt: new Date('2026-11-12T18:50:00Z'),
    ...overrides,
  });

function codeOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error instanceof SaveError ? error.code : error;
  }
  return 'no error';
}

describe('crc32', () => {
  it('matches the published check values', () => {
    expect(crc32('')).toBe('00000000');
    expect(crc32('123456789')).toBe('cbf43926');
    expect(crc32('The quick brown fox jumps over the lazy dog')).toBe('414fa339');
  });

  it('works on bytes, so accented names are covered', () => {
    expect(crc32('Räikkönen')).not.toBe(crc32('Raikkonen'));
    expect(crc32('Räikkönen')).toBe(crc32('Räikkönen'));
  });
});

describe('backup file', () => {
  it('survives a round trip, verified', () => {
    const decoded = decodeSaveFile(encode());
    expect(decoded.career).toEqual(career());
    expect(decoded.savedAt).toBe('2026-11-12T18:42:00.000Z');
    expect(decoded.integrity).toBe('verified');
  });

  it('is a labelled JSON document', () => {
    const file = JSON.parse(encode());
    expect(file).toMatchObject({
      format: SAVE_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      appVersion: '0.1.0',
      exportedAt: '2026-11-12T18:50:00.000Z',
    });
    expect(file.checksum).toMatch(/^crc32:[0-9a-f]{8}$/);
  });

  it('still loads a hand-edited file, but says it could not be verified', () => {
    const file = JSON.parse(encode());
    file.career.round = 5;
    const decoded = decodeSaveFile(JSON.stringify(file, null, 2));
    expect(decoded.career.round).toBe(5);
    expect(decoded.integrity).toBe('unverified');
  });

  it('treats a file with no stamp as unverified', () => {
    const file = JSON.parse(encode());
    delete file.checksum;
    expect(decodeSaveFile(JSON.stringify(file)).integrity).toBe('unverified');
  });

  it('is not fooled by reformatting alone', () => {
    const pretty = JSON.stringify(JSON.parse(encode()), null, 4);
    expect(decodeSaveFile(pretty).integrity).toBe('verified');
  });

  it('rejects things that are not saves', () => {
    expect(codeOf(() => decodeSaveFile(''))).toBe('not-json');
    expect(codeOf(() => decodeSaveFile('{"format":'))).toBe('not-json');
    expect(codeOf(() => decodeSaveFile('null'))).toBe('not-a-save');
    expect(codeOf(() => decodeSaveFile('[1,2,3]'))).toBe('not-a-save');
    expect(codeOf(() => decodeSaveFile('{"name":"holiday.jpg"}'))).toBe('not-a-save');
    expect(codeOf(() => decodeSaveFile(JSON.stringify({ format: SAVE_FORMAT })))).toBe('not-a-save');
    expect(codeOf(() => decodeSaveFile(JSON.stringify({ format: SAVE_FORMAT, schemaVersion: '1', career: {} })))).toBe(
      'not-a-save',
    );
  });

  it('refuses a save from a newer version of the game', () => {
    expect(codeOf(() => decodeSaveFile(encode({ schemaVersion: SCHEMA_VERSION + 1 })))).toBe('too-new');
  });

  it('refuses a save whose career is damaged, and says why', () => {
    try {
      decodeSaveFile(encode({ career: { ...career(), seasonYear: 1999 } }));
      expect.unreachable();
    } catch (error) {
      expect((error as SaveError).code).toBe('invalid');
      expect((error as SaveError).problems).toEqual(['The season must be between 2010 and 2026.']);
    }
  });

  it('drops a nonsense save time instead of failing', () => {
    expect(decodeSaveFile(encode({ savedAt: 'last Tuesday' })).savedAt).toBeNull();
  });

  it('names files by career position, then local time', () => {
    const at = new Date(2026, 10, 12, 18, 5);
    expect(saveFileName({ seasonYear: 2014, round: 5 }, at)).toBe('mrm-2014-r05-20261112-1805.json');
    expect(saveFileName({ seasonYear: 2024, round: 24 }, at)).toBe('mrm-2024-r24-20261112-1805.json');
    expect(saveFileName(null, at)).toBe('mrm-save-20261112-1805.json');
  });
});
