import 'server-only';

import { db, newId } from '@/lib/db';
import { tierOf } from '@/lib/permissions';
import type { AppRole } from '@/lib/constants/navigation';
import { DEFAULT_TIER, assignedTier, ensureEmployeeVoter, setTierRole } from '@/lib/auth/roles';

/** users column that stores a directory's stable id for an account. */
export type DirectoryIdColumn = 'entra_oid' | 'ad_object_guid';

/**
 * Finds the local user for an identity a directory (Entra ID or on-prem AD)
 * has verified, linking by the directory id first and then by email (so
 * seeded/pre-created accounts pick it up), or provisions a new users +
 * profiles row on the User tier (or the tier set in AD_DEVELOPER_EMAILS /
 * AD_ADMIN_EMAILS). Returns null if the linked profile is deactivated.
 *
 * On every sign-in it also:
 * - drops any local AIdea password: the directory is the only way in;
 * - refreshes the name, department and title from the directory (the
 *   directory is their only source; a blank department/title stays blank),
 *   and the email when no other account already uses it;
 * - puts an email listed in server settings back on its tier, with an
 *   audit_logs row (no actor: the system did it).
 */
export async function findOrCreateDirectoryUser(identity: {
  idColumn: DirectoryIdColumn;
  id: string;
  email: string;
  name: string;
  /** Omitted when the directory doesn't supply them (Entra): left unchanged. */
  department?: string | null;
  title?: string | null;
}) {
  const { idColumn } = identity;
  return db.transaction(async (tx) => {
    type Account = { id: string; email: string; has_password: boolean };
    const accountColumns = `id, email, CAST(CASE WHEN password_hash IS NULL AND must_change_password = 0 THEN 0 ELSE 1 END AS bit) AS has_password`;
    let account = await tx.queryOne<Account>(
      `SELECT ${accountColumns} FROM users WITH (UPDLOCK, HOLDLOCK) WHERE ${idColumn} = @dirId`,
      { dirId: identity.id }
    );

    let linkId = false;
    if (!account) {
      account = await tx.queryOne<Account>(`SELECT ${accountColumns} FROM users WITH (UPDLOCK, HOLDLOCK) WHERE email = @email`, {
        email: identity.email,
      });
      linkId = Boolean(account);
    }

    if (!account) {
      const id = newId();
      await tx.insert('users', { id, email: identity.email, [idColumn]: identity.id });
      account = { id, email: identity.email, has_password: false };
    }

    const profile = await tx.queryOne<{ active: boolean }>('SELECT active FROM profiles WHERE id = @id', {
      id: account.id,
    });
    if (profile?.active === false) return null;

    if (linkId) {
      await tx.update('users', { [idColumn]: identity.id }, 'id = @id', { id: account.id });
    }
    if (account.has_password) {
      await tx.update('users', { password_hash: null, must_change_password: false }, 'id = @id', { id: account.id });
    }

    if (account.email !== identity.email) {
      const taken = await tx.queryOne<{ id: string }>('SELECT id FROM users WHERE email = @email AND id <> @id', {
        email: identity.email,
        id: account.id,
      });
      if (!taken) {
        await tx.update('users', { email: identity.email }, 'id = @id', { id: account.id });
        if (profile) await tx.update('profiles', { email: identity.email }, 'id = @id', { id: account.id });
        account = { ...account, email: identity.email };
      }
    }

    const details: Record<string, string | null> = {};
    if (identity.department !== undefined) details.department = identity.department || null;
    if (identity.title !== undefined) details.job_title = identity.title || null;
    const fixedTier = assignedTier(identity.email);

    if (!profile) {
      await tx.insert('profiles', { id: account.id, email: account.email, full_name: identity.name || account.email, ...details });
      await setTierRole(tx, account.id, fixedTier ?? DEFAULT_TIER);
      await ensureEmployeeVoter(tx, account.id);
      return { id: account.id, email: account.email };
    }

    if (identity.name) details.full_name = identity.name;
    await tx.update('profiles', details, 'id = @id', { id: account.id });

    if (fixedTier) {
      const roles = await tx.query<{ name: AppRole }>(
        'SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = @id',
        { id: account.id }
      );
      const current = tierOf(roles.map((r) => r.name));
      if (current !== fixedTier) {
        await setTierRole(tx, account.id, fixedTier);
        await tx.insert('audit_logs', {
          entity_type: 'users',
          entity_id: account.id,
          actor_id: null,
          action: 'user_tier_set_by_settings',
          prior_value: JSON.stringify({ tier: current }),
          new_value: JSON.stringify({ tier: fixedTier }),
          reason: fixedTier === 'developer' ? 'Listed in AD_DEVELOPER_EMAILS' : 'Listed in AD_ADMIN_EMAILS',
          correlation_id: newId(),
        });
      }
    }

    return { id: account.id, email: account.email };
  });
}
