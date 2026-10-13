/**
 * scripts/migrate.ts — applies db/migrations/*.sql to SQL Server in filename
 * order, recording each applied file in dbo.schema_migrations.
 *
 * Each file is split into batches on lines containing only `GO` (the same
 * convention sqlcmd/SSMS use), and a file's batches run in one transaction.
 *
 * Usage:
 *   npm run db:migrate            apply pending migrations
 *   ... -- --pending              list pending migrations, apply nothing
 *   ... -- --backup-first [--backup-dir=<folder>]
 *                                 COPY_ONLY backup first when any are pending
 *   npm run db:reset              drop every object in the database, re-apply
 *                                 all migrations, then seed (dev only)
 */
import './load-env';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { db, closePool } from '../lib/db/core';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

export function splitBatches(sqlText: string): string[] {
  return sqlText
    .split(/^\s*GO\s*;?\s*$/im)
    .map((b) => b.trim())
    .filter((b) => b.replace(/--.*$/gm, '').trim().length > 0);
}

export async function resetDatabase() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    throw new Error('Refusing to reset in production (pass --force if you really mean it).');
  }
  const database = (await db.queryOne<{ name: string }>('SELECT DB_NAME() AS name'))?.name;
  console.log(`Dropping all objects in database "${database}"...`);
  await db.execute(`
    DECLARE @sql NVARCHAR(MAX) = N'';
    SELECT @sql += N'ALTER TABLE ' + QUOTENAME(s.name) + N'.' + QUOTENAME(t.name)
                 + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N';'
      FROM sys.foreign_keys fk
      JOIN sys.tables t ON t.object_id = fk.parent_object_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id;
    SELECT @sql += N'DROP PROCEDURE ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N';'
      FROM sys.procedures WHERE is_ms_shipped = 0;
    SELECT @sql += N'DROP FUNCTION ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N';'
      FROM sys.objects WHERE type IN ('FN', 'IF', 'TF') AND is_ms_shipped = 0;
    SELECT @sql += N'DROP VIEW ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N';'
      FROM sys.views WHERE is_ms_shipped = 0;
    SELECT @sql += N'DROP TABLE ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N';'
      FROM sys.tables WHERE is_ms_shipped = 0;
    EXEC sp_executesql @sql;
  `);
}

/** Migration files not yet recorded in dbo.schema_migrations, in apply order. */
export async function pendingMigrations() {
  await db.execute(`
    IF OBJECT_ID('dbo.schema_migrations', 'U') IS NULL
      CREATE TABLE dbo.schema_migrations (
        name        NVARCHAR(200)     NOT NULL CONSTRAINT pk_schema_migrations PRIMARY KEY,
        applied_at  DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
      );
  `);

  const applied = new Set(
    (await db.query<{ name: string }>('SELECT name FROM dbo.schema_migrations')).map((r) => r.name)
  );
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !applied.has(f))
    .sort();
}

/**
 * Full COPY_ONLY backup of the current database, into `dir` or else the
 * instance's default backup folder (SQL Server 2019+). Returns the file path,
 * which is on the SQL Server host. Needs db_owner or db_backupoperator.
 */
export async function backupDatabase(dir?: string) {
  const row = await db.queryOne<{ path: string | null }>(
    `DECLARE @folder NVARCHAR(4000) =
       COALESCE(@dir, CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS NVARCHAR(4000)));
     SELECT CASE WHEN @folder IS NULL THEN NULL ELSE
       @folder + CASE WHEN RIGHT(@folder, 1) = '\\' THEN '' ELSE '\\' END
       + DB_NAME() + '-predeploy-' + FORMAT(SYSDATETIME(), 'yyyyMMdd-HHmmss') + '.bak' END AS path`,
    { dir: dir || null }
  );
  if (!row?.path) {
    throw new Error('SQL Server has no default backup folder; pass --backup-dir=<folder on the SQL Server host>.');
  }
  await db.execute(
    `DECLARE @db SYSNAME = DB_NAME();
     BACKUP DATABASE @db TO DISK = @path WITH COPY_ONLY, CHECKSUM, INIT;`,
    { path: row.path }
  );
  return row.path;
}

/** Applies pending migrations; returns how many were applied. */
export async function runMigrations({ log = console.log }: { log?: (msg: string) => void } = {}) {
  let count = 0;
  for (const file of await pendingMigrations()) {
    const batches = splitBatches(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    await db.transaction(async (tx) => {
      for (const batch of batches) await tx.execute(batch);
      await tx.execute('INSERT INTO dbo.schema_migrations (name) VALUES (@name)', { name: file });
    });
    log(`Applied ${file} (${batches.length} batch${batches.length === 1 ? '' : 'es'})`);
    count++;
  }
  log(count === 0 ? 'Database is up to date.' : `Applied ${count} migration(s).`);
  return count;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--pending')) {
    // One file name per line, for deploy/iis/deploy-production.ps1.
    for (const file of await pendingMigrations()) console.log(file);
    return;
  }
  if (args.includes('--reset')) await resetDatabase();
  if (args.includes('--backup-first') && (await pendingMigrations()).length > 0) {
    const dir = args.find((a) => a.startsWith('--backup-dir='))?.slice('--backup-dir='.length);
    console.log('Backing up the database before migrating...');
    console.log(`Backup written to ${await backupDatabase(dir)} (on the SQL Server host)`);
  }
  await runMigrations();
}

// `require` is undefined when this module is imported as ESM (e.g. by vitest).
if (typeof require !== 'undefined' && require.main === module) {
  main()
    .catch((err) => {
      console.error('\nMigration failed:', err.message ?? err);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
