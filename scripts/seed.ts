/**
 * scripts/seed.ts — full local/dev seed for SQL Server.
 *
 * 1. Upserts the demo `users` rows (bcrypt password hashes) using the SAME
 *    fixed UUIDs db/seed.sql expects.
 * 2. Runs db/seed.sql (profiles, roles, program, ideas, reviews, votes...).
 *
 * Usage: npm run db:seed   (reads .env.local / .env for MSSQL_* vars)
 */
import './load-env';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { db, closePool } from '../lib/db/core';
import { splitBatches } from './migrate';

// Must match the literal UUIDs used in db/seed.sql.
const DEMO_USERS: { id: string; email: string }[] = [
  { id: '11111111-1111-1111-1111-111111111001', email: 'demo.admin1@godrejcp.com' },
  { id: '11111111-1111-1111-1111-111111111002', email: 'demo.admin2@godrejcp.com' },
  { id: '11111111-1111-1111-1111-111111111003', email: 'demo.admin3@godrejcp.com' },
  { id: '22222222-2222-2222-2222-222222222001', email: 'demo.mentor1@godrejcp.com' },
  { id: '22222222-2222-2222-2222-222222222002', email: 'demo.mentor2@godrejcp.com' },
  { id: '22222222-2222-2222-2222-222222222003', email: 'demo.mentor3@godrejcp.com' },
  { id: '33333333-3333-3333-3333-333333333001', email: 'demo.participant1@godrejcp.com' },
  { id: '33333333-3333-3333-3333-333333333002', email: 'demo.participant2@godrejcp.com' },
  { id: '33333333-3333-3333-3333-333333333003', email: 'demo.participant3@godrejcp.com' },
  { id: '44444444-4444-4444-4444-444444444001', email: 'demo.voter1@godrejcp.com' },
  { id: '44444444-4444-4444-4444-444444444002', email: 'demo.voter2@godrejcp.com' },
  { id: '44444444-4444-4444-4444-444444444003', email: 'demo.voter3@godrejcp.com' },
];

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'AideaDemo!2026';

export { DEMO_USERS, DEMO_PASSWORD };

async function ensureUsers(log: (msg: string) => void) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of DEMO_USERS) {
    await db.execute(
      `IF EXISTS (SELECT 1 FROM users WHERE id = @id)
         UPDATE users SET email = @email, password_hash = @hash WHERE id = @id
       ELSE
         INSERT INTO users (id, email, password_hash) VALUES (@id, @email, @hash)`,
      { id: u.id, email: u.email, hash }
    );
    log(`Upserted user: ${u.email}`);
  }
}

async function runSeedSql(log: (msg: string) => void) {
  const sqlPath = path.join(__dirname, '..', 'db', 'seed.sql');
  for (const batch of splitBatches(readFileSync(sqlPath, 'utf-8'))) await db.execute(batch);
  log('Applied db/seed.sql');
}

export async function seedDatabase({ log = console.log }: { log?: (msg: string) => void } = {}) {
  await ensureUsers(log);
  await runSeedSql(log);
}

// `require` is undefined when this module is imported as ESM (e.g. by vitest).
if (typeof require !== 'undefined' && require.main === module) {
  seedDatabase()
    .then(() => console.log('\nDone. Demo accounts use the DEMO_PASSWORD value (see LOCAL_SETUP.md).'))
    .catch((err) => {
      console.error(err.message ?? err);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
