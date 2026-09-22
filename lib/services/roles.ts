'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
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

export async function fetchUsersWithRoles(search?: string): Promise<UserRoleRow[]> {
  const supabase = createClient();

  let query = supabase.from('profiles').select('id, full_name, email, user_roles(roles(name))').order('full_name').limit(200);
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);

  const { data } = await query;
  return (data as any[] ?? []).map((p) => ({
    user_id: p.id,
    full_name: p.full_name,
    email: p.email,
    roles: (p.user_roles ?? []).map((ur: any) => ur.roles?.name).filter(Boolean),
  }));
}

async function countAdmins(supabase: ReturnType<typeof createClient>): Promise<number> {
  const { count } = await supabase
    .from('user_roles')
    .select('id, roles!inner(name)', { count: 'exact', head: true })
    .eq('roles.name', 'admin');
  return count ?? 0;
}

/** Grants a role to a user. Every role change is audit-logged per spec
 * section 13 — role assignment is a sensitive, security-relevant action. */
export async function addUserRole(userId: string, roleName: RoleName) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const supabase = createClient();
  const { data: role } = await supabase.from('roles').select('id').eq('name', roleName).maybeSingle();
  if (!role) return { error: 'Unknown role' } as const;

  const { error } = await supabase.from('user_roles').upsert({ user_id: userId, role_id: role.id }, { onConflict: 'user_id,role_id' });
  if (error) return { error: error.message } as const;

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
 * admin-only pages with no way back in short of direct DB access.
 */
export async function removeUserRole(userId: string, roleName: RoleName) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const supabase = createClient();

  if (roleName === 'admin') {
    const adminCount = await countAdmins(supabase);
    const { data: targetIsAdmin } = await supabase
      .from('user_roles')
      .select('id, roles!inner(name)')
      .eq('user_id', userId)
      .eq('roles.name', 'admin')
      .maybeSingle();
    if (targetIsAdmin && adminCount <= 1) {
      return { error: 'Cannot remove the last remaining admin — grant Admin to someone else first.' } as const;
    }
  }

  const { data: role } = await supabase.from('roles').select('id').eq('name', roleName).maybeSingle();
  if (!role) return { error: 'Unknown role' } as const;

  const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role_id', role.id);
  if (error) return { error: error.message } as const;

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
