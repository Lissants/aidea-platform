/**
 * The parts of scripts/migrate.ts that deploy/iis/deploy-production.ps1 uses
 * (`--pending`, `--backup-first`), against aidea_test.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { backupDatabase, pendingMigrations } from '@/scripts/migrate';
import { closePool, db, resetTestDb } from './helpers/test-db';

beforeAll(resetTestDb);
afterAll(closePool);

describe('pendingMigrations', () => {
  it('is empty once everything is applied, and lists a file whose record is missing', async () => {
    expect(await pendingMigrations()).toEqual([]);

    const [last] = await db.query<{ name: string }>('SELECT TOP 1 name FROM dbo.schema_migrations ORDER BY name DESC');
    await db.execute('DELETE FROM dbo.schema_migrations WHERE name = @name', { name: last.name });
    try {
      expect(await pendingMigrations()).toEqual([last.name]);
    } finally {
      await db.execute('INSERT INTO dbo.schema_migrations (name) VALUES (@name)', { name: last.name });
    }
  });
});

describe('backupDatabase', () => {
  it('backs up the current database COPY_ONLY to a timestamped file in the given folder', async () => {
    // Intercept the BACKUP itself: it would write a file on the SQL Server host.
    const execute = vi.spyOn(db, 'execute').mockResolvedValue(undefined as never);
    try {
      const file = await backupDatabase('X:\\sql-backups');
      expect(file).toMatch(/^X:\\sql-backups\\aidea_test-predeploy-\d{8}-\d{6}\.bak$/);
      expect(execute).toHaveBeenCalledWith(expect.stringMatching(/BACKUP DATABASE @db TO DISK = @path WITH COPY_ONLY/), {
        path: file,
      });
    } finally {
      execute.mockRestore();
    }
  });

  it('adds no second backslash when the folder already ends with one', async () => {
    const execute = vi.spyOn(db, 'execute').mockResolvedValue(undefined as never);
    try {
      expect(await backupDatabase('X:\\sql-backups\\')).toMatch(/^X:\\sql-backups\\aidea_test-predeploy-/);
    } finally {
      execute.mockRestore();
    }
  });
});
