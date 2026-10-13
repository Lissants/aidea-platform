/**
 * Integration coverage for findOrCreateDirectoryUser (lib/auth/provision.ts)
 * with on-prem AD identities: provisioning by objectGUID as User, tiers set
 * by AD_DEVELOPER_EMAILS / AD_ADMIN_EMAILS, name/department/title from AD,
 * dropping local passwords, linking a pre-created account by email, following
 * an AD email change, and refusing deactivated profiles.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SEED, closePool, db, resetTestDb } from './helpers/test-db';

const { findOrCreateDirectoryUser } = await import('@/lib/auth/provision');

beforeAll(resetTestDb);
afterAll(closePool);
afterEach(() => {
  vi.unstubAllEnvs();
});

const ad = (id: string, email: string, name = '', department: string | null = null, title: string | null = null) =>
  findOrCreateDirectoryUser({ idColumn: 'ad_object_guid', id, email, name, department, title });

const rolesOf = async (id: string) =>
  (
    await db.query<{ name: string }>(
      'SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = @id ORDER BY r.name',
      { id }
    )
  ).map((r) => r.name);

const profileOf = (id: string) =>
  db.queryOne<{ full_name: string; department: string | null; job_title: string | null }>(
    'SELECT full_name, department, job_title FROM profiles WHERE id = @id',
    { id }
  );

const tierAudits = (id: string) =>
  db.query<{ actor_id: string | null; prior_value: unknown; new_value: unknown }>(
    `SELECT actor_id, prior_value, new_value FROM audit_logs
      WHERE entity_type = 'users' AND entity_id = @id AND action = 'user_tier_set_by_settings' ORDER BY created_at`,
    { id }
  );

describe('findOrCreateDirectoryUser (Active Directory)', () => {
  it('provisions a first-time AD user as User, with AD details and no password', async () => {
    const account = await ad('guid-new-1', 'ad.person@godrejcp.com', 'AD Person', 'Supply Chain', 'Analyst');
    const user = await db.queryOne<{ ad_object_guid: string; entra_oid: string | null; password_hash: string | null }>(
      'SELECT ad_object_guid, entra_oid, password_hash FROM users WHERE id = @id',
      { id: account!.id }
    );
    expect(user).toEqual({ ad_object_guid: 'guid-new-1', entra_oid: null, password_hash: null });
    expect(await rolesOf(account!.id)).toEqual(['employee_voter', 'participant']);
    expect(await profileOf(account!.id)).toEqual({ full_name: 'AD Person', department: 'Supply Chain', job_title: 'Analyst' });
  });

  it('refreshes department and title from AD at every sign-in, clearing ones AD no longer has', async () => {
    const account = await ad('guid-new-1', 'ad.person@godrejcp.com', 'AD Person', 'Finance', null);
    expect(await profileOf(account!.id)).toEqual({ full_name: 'AD Person', department: 'Finance', job_title: null });
  });

  it('keeps the existing name when AD has no display name', async () => {
    const account = await ad('guid-new-1', 'ad.person@godrejcp.com', '', 'Finance', 'Lead');
    expect((await profileOf(account!.id))?.full_name).toBe('AD Person');
  });

  it('finds the same account by objectGUID after the email changes in AD', async () => {
    const first = await ad('guid-new-1', 'ad.person@godrejcp.com');
    const renamed = await ad('guid-new-1', 'ad.person2@godrejcp.com', 'AD Person');
    expect(renamed).toEqual({ id: first!.id, email: 'ad.person2@godrejcp.com' });
  });

  it('links a pre-created account by email and drops its local password, keeping its tier', async () => {
    const account = await ad('guid-participant1', 'demo.participant1@godrejcp.com', 'Demo Participant');
    expect(account?.id).toBe(SEED.participant1);
    const user = await db.queryOne<{ ad_object_guid: string; password_hash: string | null; must_change_password: boolean }>(
      'SELECT ad_object_guid, password_hash, must_change_password FROM users WHERE id = @id',
      { id: SEED.participant1 }
    );
    expect(user).toEqual({ ad_object_guid: 'guid-participant1', password_hash: null, must_change_password: false });
    expect(await rolesOf(SEED.participant1)).toContain('participant');
  });

  it('leaves a Mentor promoted in the app as Mentor', async () => {
    await ad('guid-mentor1', 'demo.mentor1@godrejcp.com', 'Vikram Mentor');
    expect(await rolesOf(SEED.mentor1)).toContain('mentor');
    expect(await rolesOf(SEED.mentor1)).not.toContain('participant');
  });

  it('creates a listed email on its settings tier, Developer winning over Admin', async () => {
    vi.stubEnv('AD_DEVELOPER_EMAILS', 'both.lists@godrejcp.com');
    vi.stubEnv('AD_ADMIN_EMAILS', 'Listed.Admin@godrejcp.com;both.lists@godrejcp.com');
    const admin = await ad('guid-listed-admin', 'listed.admin@godrejcp.com', 'Listed Admin');
    const dev = await ad('guid-both', 'both.lists@godrejcp.com', 'Both Lists');
    expect(await rolesOf(admin!.id)).toEqual(['admin', 'employee_voter']);
    expect(await rolesOf(dev!.id)).toEqual(['developer', 'employee_voter']);
  });

  it('puts a listed email back on its tier at sign-in, with a system audit row', async () => {
    vi.stubEnv('AD_ADMIN_EMAILS', 'demo.participant2@godrejcp.com');
    const account = await ad('guid-participant2', 'demo.participant2@godrejcp.com', 'Dev Participant');
    expect(account?.id).toBe(SEED.participant2);
    expect(await rolesOf(SEED.participant2)).toContain('admin');
    expect(await rolesOf(SEED.participant2)).not.toContain('participant');
    const audits = await tierAudits(SEED.participant2);
    expect(audits).toHaveLength(1);
    expect(audits[0].actor_id).toBeNull();
    expect(audits[0].prior_value).toEqual({ tier: 'participant' });
    expect(audits[0].new_value).toEqual({ tier: 'admin' });

    // Already on the tier: nothing changes and nothing more is logged.
    await ad('guid-participant2', 'demo.participant2@godrejcp.com', 'Dev Participant');
    expect(await tierAudits(SEED.participant2)).toHaveLength(1);
  });

  it('refuses a deactivated profile without linking it, even for a listed email', async () => {
    vi.stubEnv('AD_DEVELOPER_EMAILS', 'demo.voter2@godrejcp.com');
    await db.execute('UPDATE profiles SET active = 0 WHERE id = @id', { id: SEED.voter2 });
    expect(await ad('guid-voter2', 'demo.voter2@godrejcp.com')).toBeNull();
    const user = await db.queryOne<{ ad_object_guid: string | null }>('SELECT ad_object_guid FROM users WHERE id = @id', {
      id: SEED.voter2,
    });
    expect(user?.ad_object_guid).toBeNull();
    expect(await rolesOf(SEED.voter2)).not.toContain('developer');
  });
});
