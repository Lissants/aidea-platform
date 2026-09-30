/**
 * scripts/migrate.ts — applies db/migrations/*.sql to SQL Server in filename
 * order, recording each applied file in dbo.schema_migrations.
 *
 * Each file is split into batches on lines containing only `GO` (the same
 * convention sqlcmd/SSMS use), and a file's batches run in one transaction.
 *
 * Usage:
 *   npm run db:migrate            apply pending migrations
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

/** Applies pending migrations; returns how many were applied. */
export async function runMigrations({ log = console.log }: { log?: (msg: string) => void } = {}) {
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
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
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
  if (process.argv.includes('--reset')) await resetDatabase();
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
