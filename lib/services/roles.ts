'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db, likeContains, type Queryable } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import { logAudit } from '@/lib/audit/log';

export type RoleName = 'participant' | 'mentor' | 'admin' | 'employee_voter';

export interface UserRoleRow {
  user_id: string;
  full_name: string;
  email: string;
  roles: RoleName[];
}

/** Admin-only user/role listing (non-admins get an empty list). */
export async function fetchUsersWithRoles(search?: string): Promise<UserRoleRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return [];

  const term = search?.trim();
  const profiles = await db.query<{ id: string; full_name: string; email: string }>(
    `SELECT TOP (200) id, full_name, email
       FROM profiles
      ${term ? `WHERE full_name LIKE @q OR email LIKE @q` : ''}
      ORDER BY full_name`,
    term ? { q: likeContains(term) } : {}
  );
  if (profiles.length === 0) return [];

  const roleRows = await db.query<{ user_id: string; name: RoleName }>(
    `SELECT ur.user_id, r.name
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id IN (@ids)`,
    { ids: profiles.map((p) => p.id) }
  );
  const byUser = new Map<string, RoleName[]>();
  for (const r of roleRows) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r.name);
    byUser.set(r.user_id, list);
  }

  return profiles.map((p) => ({
    user_id: p.id,
    full_name: p.full_name,
    email: p.email,
    roles: byUser.get(p.id) ?? [],
  }));
}

async function countAdmins(q: Queryable): Promise<number> {
  const row = await q.queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count
       FROM user_roles ur WITH (UPDLOCK, HOLDLOCK)
       JOIN roles r ON r.id = ur.role_id
      WHERE r.name = 'admin'`
  );
  return row?.count ?? 0;
}

/** Grants a role to a user. Every role change is audit-logged per spec
 * section 13 — role assignment is a sensitive, security-relevant action. */
export async function addUserRole(userId: string, roleName: RoleName) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const role = await db.queryOne<{ id: string }>('SELECT id FROM roles WHERE name = @roleName', { roleName });
  if (!role) return { error: 'Unknown role' } as const;

  const { error } = await attempt(() =>
    db.execute(
      `MERGE user_roles WITH (HOLDLOCK) AS t
       USING (SELECT @userId AS user_id, @roleId AS role_id) AS s
          ON t.user_id = s.user_id AND t.role_id = s.role_id
       WHEN NOT MATCHED THEN INSERT (user_id, role_id) VALUES (s.user_id, s.role_id);`,
      { userId, roleId: role.id }
    )
  );
  if (error) return { error } as const;

  await logAudit({
    entityType: 'user_roles',
    entityId: userId,
    actorId: user.id,
    action: 'role_granted',
    newValue: { role: roleName },
  });

  revalidatePath('/roles');
  return { ok: true } as const;
}

/**
 * Revokes a role. Refuses to remove the last remaining admin's Admin role
 * platform-wide — otherwise a mis-click could lock every admin out of the
 * admin-only pages with no way back in short of direct DB access. The
 * check and delete run in one transaction (admin rows locked) so two
 * concurrent revokes can't both pass the check.
 */
export async function removeUserRole(userId: string, roleName: RoleName) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const role = await db.queryOne<{ id: string }>('SELECT id FROM roles WHERE name = @roleName', { roleName });
  if (!role) return { error: 'Unknown role' } as const;

  const LAST_ADMIN = 'Cannot remove the last remaining admin — grant Admin to someone else first.';
  const { data, error } = await attempt(() =>
    db.transaction(async (tx) => {
      if (roleName === 'admin') {
        const adminCount = await countAdmins(tx);
        const targetIsAdmin = await tx.queryOne(
          'SELECT 1 AS ok FROM user_roles WHERE user_id = @userId AND role_id = @roleId',
          { userId, roleId: role.id }
        );
        if (targetIsAdmin && adminCount <= 1) return 'last_admin' as const;
      }
      await tx.execute('DELETE FROM user_roles WHERE user_id = @userId AND role_id = @roleId', { userId, roleId: role.id });
      return 'ok' as const;
    })
  );
  if (error) return { error } as const;
  if (data === 'last_admin') return { error: LAST_ADMIN } as const;

  await logAudit({
    entityType: 'user_roles',
    entityId: userId,
    actorId: user.id,
    action: 'role_revoked',
    priorValue: { role: roleName },
  });

  revalidatePath('/roles');
  return { ok: true } as const;
}
