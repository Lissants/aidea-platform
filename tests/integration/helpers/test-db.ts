/**
 * Real-database helpers for the integration suite (replaces the old
 * fake-supabase query-builder mock). Tests run the actual service code and
 * the actual T-SQL (tables, triggers, stored procedures) against the
 * disposable `aidea_test` database created by ../global-setup.ts.
 */
import { closePool, db } from '@/lib/db/core';
import { resetDatabase, runMigrations } from '@/scripts/migrate';
import { seedDatabase } from '@/scripts/seed';
import type { SessionUser } from '@/lib/auth/session';
import type { AppRole } from '@/lib/constants/navigation';

export { db, closePool };

/** Drops every object in aidea_test, re-applies all migrations, and re-seeds the demo data. */
export async function resetTestDb() {
  const current = (await db.queryOne<{ name: string }>('SELECT DB_NAME() AS name'))?.name;
  if (current !== 'aidea_test') {
    throw new Error(`Refusing to reset "${current}" — integration tests must run against aidea_test`);
  }
  await resetDatabase();
  await runMigrations({ log: () => undefined });
  await seedDatabase({ log: () => undefined });
  // Start the test on fresh connections, so no session state from the
  // migration/seed batches leaks into the code under test.
  await closePool();
}

/** Fixed ids from db/seed.sql. */
export const SEED = {
  program: '66666666-6666-6666-6666-666666666001',
  admin1: '11111111-1111-1111-1111-111111111001',
  dev1: 'dddddddd-dddd-dddd-dddd-ddddddddd001',
  dev2: 'dddddddd-dddd-dddd-dddd-ddddddddd002',
  dev3: 'dddddddd-dddd-dddd-dddd-ddddddddd003',
  dev4: 'dddddddd-dddd-dddd-dddd-ddddddddd004',
  mentor1: '22222222-2222-2222-2222-222222222001',
  mentor2: '22222222-2222-2222-2222-222222222002',
  mentor3: '22222222-2222-2222-2222-222222222003',
  mentorProfile1: '55555555-5555-5555-5555-555555555001',
  mentorProfile2: '55555555-5555-5555-5555-555555555002',
  mentorProfile3: '55555555-5555-5555-5555-555555555003', // max_capacity = 2
  participant1: '33333333-3333-3333-3333-333333333001',
  participant2: '33333333-3333-3333-3333-333333333002',
  participant3: '33333333-3333-3333-3333-333333333003',
  voter1: '44444444-4444-4444-4444-444444444001',
  voter2: '44444444-4444-4444-4444-444444444002',
  voter3: '44444444-4444-4444-4444-444444444003',
  draftIdea: '77777777-7777-7777-7777-777777777001', // participant1's draft, no impacts
  ideaBeacon: '77777777-7777-7777-7777-777777777002', // participant2, qualifier no_build finalized+unpublished
  ideaDelta: '77777777-7777-7777-7777-777777777004', // participant1, fully published pipeline
  closedPublishedPeriod: '99999999-9999-9999-9999-999999999001',
  openPeriod: '99999999-9999-9999-9999-999999999002',
} as const;

/** Builds the SessionUser shape getCurrentUser() returns, for mocking. */
export function sessionUser(id: string, roles: AppRole[], email = `${id}@test.local`): SessionUser {
  return { id, email, profile: null, roles, mustChangePassword: false, hasPassword: true, signInMethod: 'pwd' };
}
