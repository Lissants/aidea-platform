/**
 * Integration coverage for findOrCreateSsoUser (lib/auth/microsoft.ts):
 * provisioning, linking pre-created accounts, dropping admin-issued temporary
 * passwords, refreshing the name, and refusing deactivated profiles.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED, closePool, db, resetTestDb } from './helpers/test-db';

const { findOrCreateSsoUser } = await import('@/lib/auth/microsoft');

beforeAll(resetTestDb);
afterAll(closePool);

const rolesOf = async (id: string) =>
  (
    await db.query<{ name: string }>(
      'SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = @id ORDER BY r.name',
      { id }
    )
  ).map((r) => r.name);

describe('findOrCreateSsoUser', () => {
  it('provisions a first-time user with the default SSO roles', async () => {
    const account = await findOrCreateSsoUser({ oid: 'oid-new-1', email: 'new.person@godrejcp.com', name: 'New Person' });
    expect(account?.email).toBe('new.person@godrejcp.com');

    const user = await db.queryOne<{ entra_oid: string; password_hash: string | null }>(
      'SELECT entra_oid, password_hash FROM users WHERE id = @id',
      { id: account!.id }
    );
    expect(user).toMatchObject({ entra_oid: 'oid-new-1', password_hash: null });
    expect(await rolesOf(account!.id)).toEqual(['employee_voter', 'participant']);
  });

  it('returns the same account on the next sign-in and refreshes the display name', async () => {
    const first = await findOrCreateSsoUser({ oid: 'oid-new-1', email: 'new.person@godrejcp.com', name: 'New Person' });
    const again = await findOrCreateSsoUser({ oid: 'oid-new-1', email: 'new.person@godrejcp.com', name: 'New P. Renamed' });
    expect(again?.id).toBe(first?.id);
    const profile = await db.queryOne<{ full_name: string }>('SELECT full_name FROM profiles WHERE id = @id', {
      id: again!.id,
    });
    expect(profile?.full_name).toBe('New P. Renamed');
  });

  it('links an admin-created account by email and removes its temporary password', async () => {
    await db.execute('UPDATE users SET must_change_password = 1 WHERE id = @id', { id: SEED.participant2 });

    const account = await findOrCreateSsoUser({
      oid: 'oid-participant2',
      email: 'demo.participant2@godrejcp.com',
      name: 'Dev Participant',
    });
    expect(account?.id).toBe(SEED.participant2);

    const user = await db.queryOne<{ entra_oid: string; password_hash: string | null; must_change_password: boolean }>(
      'SELECT entra_oid, password_hash, must_change_password FROM users WHERE id = @id',
      { id: SEED.participant2 }
    );
    expect(user).toEqual({ entra_oid: 'oid-participant2', password_hash: null, must_change_password: false });
    // Existing roles are untouched by sign-in.
    expect(await rolesOf(SEED.participant2)).toContain('participant');
  });

  it('keeps the password of an already-active password account it links to', async () => {
    const account = await findOrCreateSsoUser({ oid: 'oid-voter1', email: 'demo.voter1@godrejcp.com', name: '' });
    expect(account?.id).toBe(SEED.voter1);
    const user = await db.queryOne<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = @id', {
      id: SEED.voter1,
    });
    expect(user?.password_hash).not.toBeNull();
  });

  it('refuses a deactivated profile without linking it', async () => {
    await db.execute('UPDATE profiles SET active = 0 WHERE id = @id', { id: SEED.voter3 });
    const account = await findOrCreateSsoUser({ oid: 'oid-voter3', email: 'demo.voter3@godrejcp.com', name: 'Zara' });
    expect(account).toBeNull();
    const user = await db.queryOne<{ entra_oid: string | null }>('SELECT entra_oid FROM users WHERE id = @id', {
      id: SEED.voter3,
    });
    expect(user?.entra_oid).toBeNull();
  });
});
