import { describe, it, expect } from 'vitest';
import { backupFilename, isBackupFilename } from '../src/domain/backup/dump.js';

describe('backup filenames', () => {
  it('stamps local time as hoopoe-backup-YYYY-MM-DD-HHMMSSmmm.enc.json', () => {
    // 2026-08-05 03:07:09.042 local — milliseconds carry so rapid-fire runs
    // never share a filename (see dump.ts for the precision rationale).
    const name = backupFilename(new Date(2026, 7, 5, 3, 7, 9, 42));
    expect(name).toBe('hoopoe-backup-2026-08-05-030709042.enc.json');
  });
  it('accepts the legacy 6-digit (seconds-only) filename so older backups still list', () => {
    expect(isBackupFilename('hoopoe-backup-2026-08-05-030709.enc.json')).toBe(true);
  });
  it('accepts the pre-Hoopoe `athena-backup-` prefix for pre-rename backups', () => {
    expect(isBackupFilename('athena-backup-2026-08-05-030709.enc.json')).toBe(true);
    expect(isBackupFilename('athena-backup-2026-08-05-030709042.enc.json')).toBe(true);
  });
  it('its own output round-trips the filter', () => {
    expect(isBackupFilename(backupFilename(new Date()))).toBe(true);
  });
  it('rejects foreign files so pruning can never touch them', () => {
    for (const bad of [
      'holiday-photos.zip',
      'hoopoe-backup-2026-08-05.enc.json', // no time component
      'hoopoe-backup-2026-08-05-030709.json', // not sealed
      'xhoopoe-backup-2026-08-05-030709.enc.json', // prefix must anchor
      '.tmp-hoopoe-backup-2026-08-05-030709.enc.json',
    ]) {
      expect(isBackupFilename(bad)).toBe(false);
    }
  });
});
