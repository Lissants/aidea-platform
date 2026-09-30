/**
 * Vitest globalSetup for the integration suite: creates a disposable
 * `aidea_test` database on the configured SQL Server before the run and
 * drops it afterwards. Individual test files call resetTestDb()
 * (helpers/test-db.ts) to get a freshly migrated + seeded schema.
 *
 * Uses the same MSSQL_* settings as the app (.env.local), but always
 * connects to `master` here and never touches the dev `aidea` database.
 */
import '../../scripts/load-env';
import { closePool, db } from '../../lib/db/core';

export const TEST_DATABASE = 'aidea_test';

async function onMaster<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.MSSQL_DATABASE;
  process.env.MSSQL_DATABASE = 'master';
  try {
    return await fn();
  } finally {
    await closePool();
    process.env.MSSQL_DATABASE = previous;
  }
}

export async function setup() {
  await onMaster(() =>
    db.execute(`IF DB_ID(@name) IS NULL EXEC('CREATE DATABASE ' + @quoted)`, {
      name: TEST_DATABASE,
      quoted: `[${TEST_DATABASE}]`,
    })
  );
}

export async function teardown() {
  if (process.env.KEEP_TEST_DB === 'true') return;
  await onMaster(() =>
    db.execute(
      `IF DB_ID(@name) IS NOT NULL
         EXEC('ALTER DATABASE ' + @quoted + ' SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ' + @quoted)`,
      { name: TEST_DATABASE, quoted: `[${TEST_DATABASE}]` }
    )
  );
}
