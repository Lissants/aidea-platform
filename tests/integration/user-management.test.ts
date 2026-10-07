/**
 * Integration coverage for lib/services/users.ts against the real aidea_test
 * database: who may manage whom (Developer vs Admin), the tier model, the
 * self / last-admin / last-developer locks, deletion rules, the audit trail
 * and the password flows.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import type { SessionUser } from '@/lib/auth/session';
import { SEED, closePool, db, resetTestDb, sessionUser } from './helpers/test-db';

let currentUser: SessionUser | null;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => currentUser }));

const { createUser, changeUserTier, setUserActive, resetUserPassword, deleteUserPermanently, changeOwnPassword, fetchManagedUsers } =
  await import('@/lib/services/users');

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
const created = (r: object) => {
  if (!('userId' in r)) throw new Error(`expected a created user, got ${JSON.stringify(r)}`);
  return r as { userId: string; tempPassword: string };
};

beforeAll(resetTestDb);
afterAll(closePool);
beforeEach(() => {
  asDeveloper();
});

describe('seeded developers', () => {
  it('has the four developers with the developer role, active, password set', async () => {
    for (const id of [SEED.dev1, SEED.dev2, SEED.dev3, SEED.dev4]) {
      expect(await rolesOf(id)).toEqual(['developer', 'employee_voter']);
      expect(await isActive(id)).toBe(true);
    }
    const jose = await db.queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE email = @e', {
      e: 'jose.siahaan@godrejcp.com',
    });
    expect(jose?.password_hash).toMatch(/^\$2/);
  });
});

describe('creating users', () => {
  it('lets a developer create an admin, with a temp password and forced change', async () => {
    const r = created(await createUser({ email: 'New.Admin@godrejcp.com', fullName: 'New Admin', tier: 'admin' }));
    expect(await rolesOf(r.userId)).toEqual(['admin', 'employee_voter']);
    const row = await db.queryOne<{ must_change_password: boolean; password_hash: string; email: string }>(
      'SELECT must_change_password, password_hash, email FROM users WHERE id = @id',
      { id: r.userId }
    );
    expect(row?.email).toBe('new.admin@godrejcp.com');
    expect(row?.must_change_password).toBe(true);
    expect(await bcrypt.compare(r.tempPassword, row!.password_hash)).toBe(true);
  });

  it('accepts the Add user form as submitted: blank employee id and temp password', async () => {
    const r = created(
      await createUser({ email: 'form.blank@godrejcp.com', fullName: 'Form Blank', tier: 'participant', employeeId: '', tempPassword: '' })
    );
    expect(r.tempPassword.length).toBeGreaterThanOrEqual(12);
    const p = await db.queryOne<{ employee_id: string | null }>('SELECT employee_id FROM profiles WHERE id = @id', { id: r.userId });
    expect(p?.employee_id).toBeNull();
    // The browser's resolver already turned '' into null before the server parses it again.
    expect(ok(await createUser({ email: 'form.null@godrejcp.com', fullName: 'Form Null', tier: 'participant', employeeId: null }))).toBe(true);
  });

  it('creates a mentor_profiles row for a new mentor', async () => {
    const r = created(await createUser({ email: 'new.mentor@godrejcp.com', fullName: 'New Mentor', tier: 'mentor' }));
    expect(await db.queryOne('SELECT 1 AS ok FROM mentor_profiles WHERE profile_id = @id', { id: r.userId })).not.toBeNull();
  });

  it('stops an admin creating admins or developers, but allows users and mentors', async () => {
    asAdmin();
    expect('error' in (await createUser({ email: 'a1@godrejcp.com', fullName: 'A One', tier: 'admin' }))).toBe(true);
    expect('error' in (await createUser({ email: 'd1@godrejcp.com', fullName: 'D One', tier: 'developer' }))).toBe(true);
    expect(ok(await createUser({ email: 'u1@godrejcp.com', fullName: 'U One', tier: 'participant' }))).toBe(true);
    expect(ok(await createUser({ email: 'm1@godrejcp.com', fullName: 'M One', tier: 'mentor' }))).toBe(true);
  });

  it('rejects a duplicate email and a disallowed domain', async () => {
    const dup = await createUser({ email: 'u1@godrejcp.com', fullName: 'Dup', tier: 'participant' });
    expect('error' in dup && dup.error).toMatch(/already exists/i);
    process.env.ALLOWED_EMAIL_DOMAIN = 'godrejcp.com';
    try {
      const bad = await createUser({ email: 'x@gmail.com', fullName: 'Outsider', tier: 'participant' });
      expect('error' in bad && bad.error).toMatch(/domain/i);
    } finally {
      delete process.env.ALLOWED_EMAIL_DOMAIN;
    }
  });

  it('refuses everyone who is not an admin or developer', async () => {
    currentUser = sessionUser(SEED.mentor1, ['mentor']);
    expect('error' in (await createUser({ email: 'z@godrejcp.com', fullName: 'Zed Zed', tier: 'participant' }))).toBe(true);
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

    const r = created(await createUser({ email: 'delete.me@godrejcp.com', fullName: 'Delete Me', tier: 'participant' }));
    expect(ok(await deleteUserPermanently(r.userId))).toBe(true);
    expect(await db.queryOne('SELECT 1 AS ok FROM users WHERE id = @id', { id: r.userId })).toBeNull();
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

describe('audit trail and passwords', () => {
  it('writes an audit row per change, with no password in it', async () => {
    const r = created(await createUser({ email: 'audit.me@godrejcp.com', fullName: 'Audit Me', tier: 'participant' }));
    await changeUserTier(r.userId, 'mentor');
    await setUserActive(r.userId, false);
    const reset = await resetUserPassword(r.userId);
    expect(ok(reset)).toBe(true);

    const rows = await db.query<{ action: string; actor_id: string }>(
      `SELECT action, actor_id, prior_value, new_value
         FROM audit_logs WHERE entity_type = 'users' AND entity_id = @id ORDER BY created_at`,
      { id: r.userId }
    );
    expect(rows.map((x) => x.action)).toEqual(['user_created', 'user_tier_changed', 'user_deactivated', 'user_password_reset']);
    expect(rows.every((x) => x.actor_id === SEED.dev1)).toBe(true);
    const everything = JSON.stringify(rows);
    expect(everything).not.toContain(r.tempPassword);
    if ('tempPassword' in reset) expect(everything).not.toContain(reset.tempPassword);
  });

  it('resets a password to a new temp one that must be changed', async () => {
    const before = await db.queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = @id', {
      id: SEED.participant3,
    });
    const r = await resetUserPassword(SEED.participant3);
    if (!('tempPassword' in r)) throw new Error('expected tempPassword');
    const after = await db.queryOne<{ password_hash: string; must_change_password: boolean }>(
      'SELECT password_hash, must_change_password FROM users WHERE id = @id',
      { id: SEED.participant3 }
    );
    expect(after?.password_hash).not.toBe(before?.password_hash);
    expect(after?.must_change_password).toBe(true);
    expect(await bcrypt.compare(r.tempPassword, after!.password_hash)).toBe(true);
    asAdmin();
    expect('error' in (await resetUserPassword(SEED.dev2))).toBe(true);
  });

  it('lets a user change their own password only with the right current one, and clears the flag', async () => {
    const c = created(
      await createUser({ email: 'pw.change@godrejcp.com', fullName: 'Pw Change', tier: 'participant', tempPassword: 'Temporary-Pass-123' })
    );
    currentUser = sessionUser(c.userId, ['participant']);

    const wrong = await changeOwnPassword({
      currentPassword: 'nope-nope-nope',
      newPassword: 'Brand-New-Pass-456',
      confirmPassword: 'Brand-New-Pass-456',
    });
    expect('error' in wrong && wrong.error).toMatch(/incorrect/i);
    const short = await changeOwnPassword({ currentPassword: 'Temporary-Pass-123', newPassword: 'short', confirmPassword: 'short' });
    expect('error' in short).toBe(true);

    const good = await changeOwnPassword({
      currentPassword: 'Temporary-Pass-123',
      newPassword: 'Brand-New-Pass-456',
      confirmPassword: 'Brand-New-Pass-456',
    });
    expect(ok(good)).toBe(true);
    const row = await db.queryOne<{ password_hash: string; must_change_password: boolean }>(
      'SELECT password_hash, must_change_password FROM users WHERE id = @id',
      { id: c.userId }
    );
    expect(row?.must_change_password).toBe(false);
    expect(await bcrypt.compare('Brand-New-Pass-456', row!.password_hash)).toBe(true);
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
