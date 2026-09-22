/**
 * scripts/seed.ts — full local/dev seed.
 *
 * 1. Creates the demo auth.users rows via the Supabase Admin API (the only
 *    supported way to create real auth users outside the browser sign-up
 *    flow), using the SAME fixed UUIDs supabase/seed.sql expects.
 * 2. Runs supabase/seed.sql's statements via supabase-js against the now-
 *    satisfied profiles(id) -> auth.users(id) foreign key.
 *
 * Usage: npm run seed  (reads .env.local / .env for SUPABASE_* vars)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// `tsx` does not load Next.js environment files itself. Match Next's
// `.env.local` / `.env` loading behavior before reading the credentials.
loadEnvConfig(process.cwd());

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to seed.');
  process.exit(1);
}

const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Must match the literal UUIDs used in supabase/seed.sql.
const DEMO_USERS: { id: string; email: string; full_name: string }[] = [
  { id: '11111111-1111-1111-1111-111111111001', email: 'demo.admin1@godrejcp.com', full_name: 'Asha Admin' },
  { id: '11111111-1111-1111-1111-111111111002', email: 'demo.admin2@godrejcp.com', full_name: 'Rohan Admin' },
  { id: '11111111-1111-1111-1111-111111111003', email: 'demo.admin3@godrejcp.com', full_name: 'Meera Admin' },
  { id: '22222222-2222-2222-2222-222222222001', email: 'demo.mentor1@godrejcp.com', full_name: 'Vikram Mentor' },
  { id: '22222222-2222-2222-2222-222222222002', email: 'demo.mentor2@godrejcp.com', full_name: 'Priya Mentor' },
  { id: '22222222-2222-2222-2222-222222222003', email: 'demo.mentor3@godrejcp.com', full_name: 'Karan Mentor' },
  { id: '33333333-3333-3333-3333-333333333001', email: 'demo.participant1@godrejcp.com', full_name: 'Sara Participant' },
  { id: '33333333-3333-3333-3333-333333333002', email: 'demo.participant2@godrejcp.com', full_name: 'Dev Participant' },
  { id: '33333333-3333-3333-3333-333333333003', email: 'demo.participant3@godrejcp.com', full_name: 'Ila Participant' },
  { id: '44444444-4444-4444-4444-444444444001', email: 'demo.voter1@godrejcp.com', full_name: 'Nina Voter' },
  { id: '44444444-4444-4444-4444-444444444002', email: 'demo.voter2@godrejcp.com', full_name: 'Omkar Voter' },
  { id: '44444444-4444-4444-4444-444444444003', email: 'demo.voter3@godrejcp.com', full_name: 'Zara Voter' },
];

const DEMO_PASSWORD = 'AideaDemo!2026';

async function ensureAuthUsers() {
  for (const u of DEMO_USERS) {
    const { data: existing } = await admin.auth.admin.getUserById(u.id).catch(() => ({ data: null }) as any);
    if (existing?.user) {
      console.log(`Auth user already exists: ${u.email}`);
      continue;
    }

    // NOTE: passing a fixed `id` to createUser is a Supabase Admin API
    // convenience some GoTrue versions support for seeding; if your project
    // rejects it, omit `id` and instead update supabase/seed.sql to use the
    // UUID this call returns.
    const { error } = await admin.auth.admin.createUser({
      id: u.id,
      email: u.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.full_name },
    } as any);

    if (error) {
      console.error(`Failed to create ${u.email}:`, error.message);
    } else {
      console.log(`Created auth user: ${u.email}`);
    }
  }
}

async function runSeedSql() {
  const sqlPath = path.join(__dirname, '..', 'supabase', 'seed.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  // supabase-js has no generic "run arbitrary SQL" call without a helper
  // function; for local Supabase CLI usage, `supabase db reset` already
  // applies supabase/seed.sql automatically after migrations. This function
  // is a convenience for environments where that isn't available: it prints
  // instructions rather than guessing at a bespoke SQL-exec RPC that may not
  // exist on the target project.
  console.log(
    `\nAuth users are seeded. To load supabase/seed.sql's demo data, run either:\n` +
      `  supabase db reset            (re-applies migrations + seed.sql), or\n` +
      `  psql "$DATABASE_URL" -f supabase/seed.sql\n`
  );
  void sql;
}

async function main() {
  await ensureAuthUsers();
  await runSeedSql();
  console.log('\nDone. Demo password for all seeded accounts:', DEMO_PASSWORD);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
