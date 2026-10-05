/**
 * Runs SQL statements against the dev database for e2e setup:
 *   echo '[{"sql": "...", "params": {...}}]' | npx tsx tests/e2e/helpers/db-exec.ts
 * Playwright's loader can't resolve the mssql driver subpath imports used by
 * lib/db/core.ts, so specs call this through `runSql` (child process) instead.
 */
import '../../../scripts/load-env';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export type SqlStep = { sql: string; params?: Record<string, unknown> };

/** Executes the steps in one transaction, via a tsx child process. */
export function runSql(steps: SqlStep[]) {
  execFileSync('npx', ['tsx', path.join(__dirname, 'db-exec.ts')], {
    input: JSON.stringify(steps),
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
    cwd: path.join(__dirname, '..', '..', '..'),
  });
}

async function main() {
  const { db, closePool } = await import('../../../lib/db/core');
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const steps = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as SqlStep[];
  try {
    await db.transaction(async (tx) => {
      for (const step of steps) await tx.execute(step.sql, step.params ?? {});
    });
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
