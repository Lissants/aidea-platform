/**
 * db/migrations/0015_remove_seeded_developers.sql against aidea_test: the
 * three previously seeded Developers become Users, a tier set by hand since
 * is left alone, and re-running the file changes nothing.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { splitBatches } from '@/scripts/migrate';
import { closePool, db, resetTestDb } from './helpers/test-db';

const JANICE = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee001';
const JOSE = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeee002';

async function account(id: string, email: string, roles: string[]) {
  await db.execute(
    `INSERT INTO users (id, email) VALUES (@id, @email);
     INSERT INTO profiles (id, email, full_name, active) VALUES (@id, @email, @email, 1);
     INSERT INTO user_roles (user_id, role_id) SELECT @id, r.id FROM roles r WHERE r.name IN (@roles);`,
    { id, email, roles }
  );
}

const rolesOf = async (id: string) =>
  (
    await db.query<{ name: string }>(
      'SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = @id ORDER BY r.name',
      { id }
    )
  ).map((r) => r.name);

async function runMigration() {
  const sql = readFileSync(path.join(__dirname, '..', '..', 'db', 'migrations', '0015_remove_seeded_developers.sql'), 'utf-8');
  for (const batch of splitBatches(sql)) await db.execute(batch);
}

beforeAll(async () => {
  await resetTestDb();
  await account(JANICE, 'janice.ong@godrejcp.com', ['developer', 'employee_voter']);
  await account(JOSE, 'jose.siahaan@godrejcp.com', ['mentor']);
});
afterAll(closePool);

describe('migration 0015', () => {
  it('moves a seeded Developer to User and logs it, leaving a hand-set tier alone', async () => {
    await runMigration();
    expect(await rolesOf(JANICE)).toEqual(['employee_voter', 'participant']);
    expect(await rolesOf(JOSE)).toEqual(['mentor']);
    const audit = await db.query<{ actor_id: string | null; prior_value: unknown; new_value: unknown }>(
      `SELECT actor_id, prior_value, new_value FROM audit_logs WHERE entity_id = @id AND action = 'user_tier_set_by_settings'`,
      { id: JANICE }
    );
    expect(audit).toEqual([{ actor_id: null, prior_value: { tier: 'developer' }, new_value: { tier: 'participant' } }]);
  });

  it('changes nothing when run again', async () => {
    await runMigration();
    expect(await rolesOf(JANICE)).toEqual(['employee_voter', 'participant']);
    const audits = await db.queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id = @id AND action = 'user_tier_set_by_settings'`,
      { id: JANICE }
    );
    expect(audits?.n).toBe(1);
  });
});
