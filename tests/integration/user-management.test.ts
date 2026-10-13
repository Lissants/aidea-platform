/**
 * Integration coverage for lib/services/users.ts against the real aidea_test
 * database: who may manage whom (Developer vs Admin), the tier model, the
 * self / last-admin / last-developer locks, tiers locked by
 * AD_DEVELOPER_EMAILS / AD_ADMIN_EMAILS, deletion rules and the audit trail.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/auth/session';
import { SEED, closePool, db, resetTestDb, sessionUser } from './helpers/test-db';

let currentUser: SessionUser | null;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => currentUser }));

const { changeUserTier, setUserActive, deleteUserPermanently, fetchManagedUsers } = await import('@/lib/services/users');

const GHOST = '00000000-0000-0000-0000-000000000099'; // developer session with no profile row
const OTHER_ADMIN = '11111111-1111-1111-1111-111111111002';
const asDeveloper = () => (currentUser = sessionUser(SEED.dev1, ['developer', 'employee_voter']));
const asAdmin = () => (currentUser = sessionUser(SEED.admin1, ['admin']));

const rolesOf = async (id: string) =>
  (
    await db.query<{ name: string }>(
      'SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = @id ORDER BY r.name',
      { id }
    )
  ).map((r) => r.name);
const isActive = async (id: string) =>
  (await db.queryOne<{ active: boolean }>('SELECT active FROM profiles WHERE id = @id', { id }))?.active;
const ok = (r: object) => 'ok' in r;

/** A User-tier account with no history, as a first AD sign-in creates it. */
async function makeUser(email: string) {
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO users (id, email) VALUES (@id, @email);
     INSERT INTO profiles (id, email, full_name, active) VALUES (@id, @email, @email, 1);
     INSERT INTO user_roles (user_id, role_id) SELECT @id, r.id FROM roles r WHERE r.name IN ('participant', 'employee_voter');`,
    { id, email }
  );
  return id;
}

beforeAll(resetTestDb);
afterAll(closePool);
beforeEach(() => {
  asDeveloper();
});

describe('listing', () => {
  it('refuses everyone who is not an admin or developer', async () => {
    currentUser = sessionUser(SEED.mentor1, ['mentor']);
    expect((await fetchManagedUsers()).users).toHaveLength(0);
  });
});

describe('changing tiers', () => {
  it('promotes a user to mentor (creating the mentor profile) and back', async () => {
    expect(ok(await changeUserTier(SEED.voter1, 'mentor'))).toBe(true);
    expect(await rolesOf(SEED.voter1)).toEqual(['employee_voter', 'mentor']);
    expect(await db.queryOne('SELECT 1 AS ok FROM mentor_profiles WHERE profile_id = @id', { id: SEED.voter1 })).not.toBeNull();
    expect(ok(await changeUserTier(SEED.voter1, 'participant'))).toBe(true);
    expect(await rolesOf(SEED.voter1)).toEqual(['employee_voter', 'participant']);
  });

  it('lets a developer make someone admin and demote them again', async () => {
    expect(ok(await changeUserTier(SEED.participant2, 'admin'))).toBe(true);
    expect(await rolesOf(SEED.participant2)).toEqual(['admin']);
    expect(ok(await changeUserTier(SEED.participant2, 'participant'))).toBe(true);
    expect(await rolesOf(SEED.participant2)).toEqual(['participant']);
  });

  it('blocks an admin from promoting to admin, and from touching admins or developers', async () => {
    asAdmin();
    expect('error' in (await changeUserTier(SEED.participant3, 'admin'))).toBe(true);
    expect('error' in (await changeUserTier(SEED.participant3, 'developer'))).toBe(true);
    expect('error' in (await changeUserTier(SEED.dev2, 'participant'))).toBe(true);
    expect('error' in (await changeUserTier(OTHER_ADMIN, 'participant'))).toBe(true);
    expect(await rolesOf(SEED.dev2)).toEqual(['developer', 'employee_voter']);
    expect(ok(await changeUserTier(SEED.participant3, 'mentor'))).toBe(true);
    expect(ok(await changeUserTier(SEED.participant3, 'participant'))).toBe(true);
  });

  it('blocks changing your own tier', async () => {
    const r = await changeUserTier(SEED.dev1, 'participant');
    expect('error' in r && r.error).toMatch(/your own/i);
    expect(await rolesOf(SEED.dev1)).toContain('developer');
  });
});

describe('deactivating and deleting', () => {
  it('deactivates and reactivates, and blocks self-deactivation', async () => {
    expect(ok(await setUserActive(SEED.participant3, false))).toBe(true);
    expect(await isActive(SEED.participant3)).toBe(false);
    expect(ok(await setUserActive(SEED.participant3, true))).toBe(true);
    expect(await isActive(SEED.participant3)).toBe(true);
    expect('error' in (await setUserActive(SEED.dev1, false))).toBe(true);
  });

  it('refuses to delete a user who has ideas, and deletes one who has none', async () => {
    const blocked = await deleteUserPermanently(SEED.participant1);
    expect('error' in blocked && blocked.error).toMatch(/deactivate/i);
    expect(await rolesOf(SEED.participant1)).toContain('participant');

    const id = await makeUser('delete.me@godrejcp.com');
    expect(ok(await deleteUserPermanently(id))).toBe(true);
    expect(await db.queryOne('SELECT 1 AS ok FROM users WHERE id = @id', { id })).toBeNull();
  });

  it('keeps the last active developer and the last active admin-level account', async () => {
    // Every developer but dev1, and every admin, goes inactive: dev1 is the only admin-level account left.
    for (const id of [SEED.dev2, SEED.dev3, SEED.dev4]) expect(ok(await setUserActive(id, false))).toBe(true);
    const admins = await db.query<{ user_id: string }>(
      `SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = 'admin'`
    );
    for (const a of admins) await db.execute('UPDATE profiles SET active = 0 WHERE id = @id', { id: a.user_id });

    // A developer session that is not itself one of the accounts, so the self-lock can't be what stops it.
    currentUser = sessionUser(GHOST, ['developer']);
    const demote = await changeUserTier(SEED.dev1, 'mentor');
    expect('error' in demote && demote.error).toMatch(/last active developer/i);
    const off = await setUserActive(SEED.dev1, false);
    expect('error' in off && off.error).toMatch(/last active developer/i);
    expect(await rolesOf(SEED.dev1)).toContain('developer');
    expect(await isActive(SEED.dev1)).toBe(true);

    for (const a of admins) await db.execute('UPDATE profiles SET active = 1 WHERE id = @id', { id: a.user_id });
    for (const id of [SEED.dev2, SEED.dev3, SEED.dev4]) await setUserActive(id, true);
  });
});

describe('tiers set in server settings', () => {
  it('shows a listed email as locked and refuses to change its tier', async () => {
    const id = await makeUser('listed.admin@godrejcp.com');
    await db.execute(
      `DELETE ur FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = @id AND r.name = 'participant';
       INSERT INTO user_roles (user_id, role_id) SELECT @id, id FROM roles WHERE name = 'admin';`,
      { id }
    );
    vi.stubEnv('AD_ADMIN_EMAILS', 'Listed.Admin@godrejcp.com; someone.else@godrejcp.com');
    try {
      const row = (await fetchManagedUsers('listed.admin')).users.find((u) => u.user_id === id);
      expect(row).toMatchObject({ tier: 'admin', tierLockedBySettings: true, assignableTiers: [] });
      const r = await changeUserTier(id, 'participant');
      expect('error' in r && r.error).toMatch(/server settings/i);
      expect(await rolesOf(id)).toEqual(['admin', 'employee_voter']);
      // Deactivating still works: a listed person can be blocked.
      expect(ok(await setUserActive(id, false))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('audit trail', () => {
  it('writes an audit row per change, in the name of the admin who made it', async () => {
    const id = await makeUser('audit.me@godrejcp.com');
    await changeUserTier(id, 'mentor');
    await setUserActive(id, false);

    const rows = await db.query<{ action: string; actor_id: string }>(
      `SELECT action, actor_id FROM audit_logs WHERE entity_type = 'users' AND entity_id = @id ORDER BY created_at`,
      { id }
    );
    expect(rows.map((x) => x.action)).toEqual(['user_tier_changed', 'user_deactivated']);
    expect(rows.every((x) => x.actor_id === SEED.dev1)).toBe(true);
  });
});

describe('developer is a superset of admin in the database', () => {
  it("fn_has_role: a developer passes 'admin', an admin does not pass 'developer'", async () => {
    const dev = await db.queryOne<{ v: boolean }>("SELECT dbo.fn_has_role(@id, 'admin') AS v", { id: SEED.dev1 });
    const adm = await db.queryOne<{ v: boolean }>("SELECT dbo.fn_has_role(@id, 'developer') AS v", { id: SEED.admin1 });
    expect(dev?.v).toBe(true);
    expect(adm?.v).toBe(false);
  });
});
