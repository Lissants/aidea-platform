'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db, likeContains, type Queryable } from '@/lib/db';
import { getCurrentUser, type SessionUser } from '@/lib/auth/session';
import { assignedTier, setTierRole } from '@/lib/auth/roles';
import { logAudit } from '@/lib/audit/log';
import { USER_TIERS, type AppRole, type UserTier } from '@/lib/constants/navigation';
import { canManageUser, isAdmin, tierOf } from '@/lib/permissions';

/**
 * User management (change tier / deactivate / delete). Accounts are created
 * by a person's first Active Directory sign-in (lib/auth/provision.ts), and
 * passwords are Windows passwords, so there is no create or reset here.
 *
 * Every action re-checks the caller itself (SECURITY.md: never trust the UI).
 * Who may touch whom is decided by canManageUser() in lib/permissions: a
 * Developer manages every tier, an Admin only User and Mentor accounts.
 * Accounts are never edited by raw role grants: a user sits on exactly one
 * tier (participant < mentor < admin < developer); `employee_voter` is an
 * extra role that tier changes never touch. The tier of an email listed in
 * AD_DEVELOPER_EMAILS / AD_ADMIN_EMAILS is set at sign-in and locked here.
 */

const PAGE_SIZE = 50;

export interface ManagedUser {
  user_id: string;
  full_name: string;
  email: string;
  tier: UserTier | null;
  active: boolean;
  last_sign_in_at: string | null;
  /** Tier fixed by AD_DEVELOPER_EMAILS / AD_ADMIN_EMAILS: shown read-only. */
  tierLockedBySettings: boolean;
  /** Tiers the caller may move this user to (empty = read-only row). */
  assignableTiers: UserTier[];
  /** Whether the caller may deactivate / reset / delete this account. */
  canManage: boolean;
  isSelf: boolean;
}

export interface ManagedUserPage {
  users: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
}

type Result<T = object> = ({ ok: true } & T) | { error: string };

const NOT_AUTHORIZED = { error: 'Not authorized' } as const;

async function requireManager(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && isAdmin(user.roles) ? user : null;
}

interface Target {
  id: string;
  email: string;
  full_name: string;
  active: boolean;
  roles: AppRole[];
  tier: UserTier | null;
}

async function loadTarget(q: Queryable, userId: string): Promise<Target | null> {
  const p = await q.queryOne<{ id: string; email: string; full_name: string; active: boolean }>(
    'SELECT id, email, full_name, active FROM profiles WHERE id = @id',
    { id: userId }
  );
  if (!p) return null;
  const rows = await q.query<{ name: AppRole }>(
    'SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = @id',
    { id: userId }
  );
  const roles = rows.map((r) => r.name);
  return { ...p, roles, tier: tierOf(roles) };
}

/** Active accounts holding any of `tiers`, optionally ignoring one user. Locks the rows read. */
async function countActiveHolders(q: Queryable, tiers: UserTier[], excludeUserId: string): Promise<number> {
  const row = await q.queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT ur.user_id) AS count
       FROM user_roles ur WITH (UPDLOCK, HOLDLOCK)
       JOIN roles r ON r.id = ur.role_id
       JOIN profiles p ON p.id = ur.user_id
      WHERE r.name IN (@tiers) AND p.active = 1 AND ur.user_id <> @exclude`,
    { tiers, exclude: excludeUserId }
  );
  return row?.count ?? 0;
}

/**
 * Refuses a change that would leave the platform without an active Developer
 * (when `target` is one) or without any active admin-level account.
 */
async function lockoutError(q: Queryable, target: Target, remainsAtTier: UserTier | null): Promise<string | null> {
  // An already-inactive account doesn't count toward either minimum.
  if (!target.active) return null;
  const keepsDeveloper = remainsAtTier === 'developer';
  if (target.tier === 'developer' && !keepsDeveloper) {
    if ((await countActiveHolders(q, ['developer'], target.id)) === 0) {
      return 'Cannot remove the last active Developer: make someone else a Developer first.';
    }
  }
  const keepsAdminLevel = remainsAtTier === 'admin' || remainsAtTier === 'developer';
  if ((target.tier === 'admin' || target.tier === 'developer') && !keepsAdminLevel) {
    if ((await countActiveHolders(q, ['admin', 'developer'], target.id)) === 0) {
      return 'Cannot remove the last active admin: make someone else an Admin or Developer first.';
    }
  }
  return null;
}

async function hasPendingReviews(q: Queryable, userId: string): Promise<boolean> {
  const row = await q.queryOne(
    `SELECT TOP (1) 1 AS ok
       FROM review_assignments ra JOIN mentor_profiles mp ON mp.id = ra.mentor_profile_id
      WHERE mp.profile_id = @id AND ra.status = 'pending'`,
    { id: userId }
  );
  return !!row;
}

const PENDING_REVIEWS_ERROR =
  'This mentor still has pending review assignments. Reassign them in Review Assignment first.';

function refresh() {
  revalidatePath('/roles');
  revalidatePath('/audit');
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export async function fetchManagedUsers(search?: string, page = 1): Promise<ManagedUserPage> {
  const actor = await requireManager();
  const empty: ManagedUserPage = { users: [], total: 0, page: 1, pageSize: PAGE_SIZE };
  if (!actor) return empty;

  const term = search?.trim();
  const where = term ? 'WHERE p.full_name LIKE @q OR p.email LIKE @q' : '';
  const params = term ? { q: likeContains(term) } : {};
  const safePage = Math.max(1, Math.floor(page) || 1);

  const totalRow = await db.queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM profiles p ${where}`, params);
  const profiles = await db.query<{
    id: string;
    full_name: string;
    email: string;
    active: boolean;
    last_sign_in_at: Date | string | null;
  }>(
    `SELECT p.id, p.full_name, p.email, p.active, u.last_sign_in_at
       FROM profiles p JOIN users u ON u.id = p.id
      ${where}
      ORDER BY p.full_name, p.email
     OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`,
    { ...params, offset: (safePage - 1) * PAGE_SIZE, size: PAGE_SIZE }
  );

  const rolesByUser = new Map<string, AppRole[]>();
  if (profiles.length > 0) {
    const roleRows = await db.query<{ user_id: string; name: AppRole }>(
      `SELECT ur.user_id, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id IN (@ids)`,
      { ids: profiles.map((p) => p.id) }
    );
    for (const r of roleRows) rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) ?? []), r.name]);
  }

  const users = profiles.map((p): ManagedUser => {
    const tier = tierOf(rolesByUser.get(p.id) ?? []);
    const isSelf = p.id === actor.id;
    const manageable = !isSelf && canManageUser(actor.roles, tier ?? 'participant');
    const tierLockedBySettings = assignedTier(p.email) !== null;
    return {
      user_id: p.id,
      full_name: p.full_name,
      email: p.email,
      tier,
      active: p.active === true,
      last_sign_in_at: p.last_sign_in_at ? new Date(p.last_sign_in_at).toISOString() : null,
      tierLockedBySettings,
      canManage: manageable,
      isSelf,
      assignableTiers:
        manageable && !tierLockedBySettings ? USER_TIERS.filter((t) => canManageUser(actor.roles, tier ?? 'participant', t)) : [],
    };
  });

  return {
    users,
    total: totalRow?.count ?? 0,
    page: safePage,
    pageSize: PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Moves a user to `newTier` (promote or demote). */
export async function changeUserTier(userId: string, newTier: UserTier): Promise<Result> {
  const actor = await requireManager();
  if (!actor) return NOT_AUTHORIZED;
  if (!USER_TIERS.includes(newTier)) return { error: 'Unknown tier' };
  if (userId === actor.id) return { error: 'You cannot change your own tier. Ask another administrator.' };

  const res = await attempt(() =>
    db.transaction(async (tx) => {
      const target = await loadTarget(tx, userId);
      if (!target) return { error: 'User not found' } as const;
      if (assignedTier(target.email)) {
        return { error: "This user's tier is set in the server settings (AD_DEVELOPER_EMAILS / AD_ADMIN_EMAILS)." } as const;
      }
      const from = target.tier ?? 'participant';
      if (from === newTier && target.tier) return { error: `Already ${newTier}` } as const;
      if (!canManageUser(actor.roles, from, newTier)) return { error: 'Not authorized to make that change' } as const;
      const lockout = await lockoutError(tx, target, newTier);
      if (lockout) return { error: lockout } as const;
      if (target.tier === 'mentor' && newTier !== 'mentor' && (await hasPendingReviews(tx, userId))) {
        return { error: PENDING_REVIEWS_ERROR } as const;
      }
      await setTierRole(tx, userId, newTier);
      return { ok: true, from: target.tier, email: target.email } as const;
    })
  );
  if (res.error !== null) return { error: res.error };
  const data = res.data;
  if ('error' in data) return data;

  await logAudit({
    entityType: 'users',
    entityId: userId,
    actorId: actor.id,
    action: 'user_tier_changed',
    priorValue: { tier: data.from },
    newValue: { tier: newTier },
  });
  refresh();
  return { ok: true };
}

/** Deactivating blocks sign-in immediately (getCurrentUser re-reads `active` per request) and keeps all history. */
export async function setUserActive(userId: string, active: boolean): Promise<Result> {
  const actor = await requireManager();
  if (!actor) return NOT_AUTHORIZED;
  if (userId === actor.id) return { error: 'You cannot deactivate your own account.' };

  const res = await attempt(() =>
    db.transaction(async (tx) => {
      const target = await loadTarget(tx, userId);
      if (!target) return { error: 'User not found' } as const;
      if (!canManageUser(actor.roles, target.tier ?? 'participant')) return { error: 'Not authorized to manage this user' } as const;
      if (target.active === active) return { error: active ? 'Already active' : 'Already deactivated' } as const;
      if (!active) {
        const lockout = await lockoutError(tx, target, null);
        if (lockout) return { error: lockout } as const;
        if (await hasPendingReviews(tx, userId)) return { error: PENDING_REVIEWS_ERROR } as const;
      }
      await tx.execute('UPDATE profiles SET active = @active, updated_at = SYSDATETIMEOFFSET() WHERE id = @id', {
        id: userId,
        active: active ? 1 : 0,
      });
      return { ok: true } as const;
    })
  );
  if (res.error !== null) return { error: res.error };
  const data = res.data;
  if ('error' in data) return data;

  await logAudit({
    entityType: 'users',
    entityId: userId,
    actorId: actor.id,
    action: active ? 'user_reactivated' : 'user_deactivated',
  });
  refresh();
  return { ok: true };
}

/**
 * Permanently deletes an account. The foreign keys from ideas, votes, reviews,
 * decisions and audit logs are intentionally not cascading, so the database
 * itself refuses (and the transaction rolls back) for anyone with history;
 * those accounts must be deactivated instead.
 */
export async function deleteUserPermanently(userId: string): Promise<Result> {
  const actor = await requireManager();
  if (!actor) return NOT_AUTHORIZED;
  if (userId === actor.id) return { error: 'You cannot delete your own account.' };

  const res = await attempt(() =>
    db.transaction(async (tx) => {
      const target = await loadTarget(tx, userId);
      if (!target) return { error: 'User not found' } as const;
      if (!canManageUser(actor.roles, target.tier ?? 'participant')) return { error: 'Not authorized to manage this user' } as const;
      const lockout = await lockoutError(tx, target, null);
      if (lockout) return { error: lockout } as const;
      await tx.execute('DELETE FROM users WHERE id = @id', { id: userId });
      return { ok: true, email: target.email, tier: target.tier } as const;
    })
  );
  if (res.error !== null) {
    const referenced = /REFERENCE constraint|FOREIGN KEY|conflicted/i.test(res.error);
    return {
      error: referenced
        ? 'This user has ideas, votes, reviews or audit history and cannot be deleted. Deactivate the account instead.'
        : res.error,
    };
  }
  const data = res.data;
  if ('error' in data) return data;

  await logAudit({
    entityType: 'users',
    entityId: userId,
    actorId: actor.id,
    action: 'user_deleted',
    priorValue: { email: data.email, tier: data.tier },
  });
  refresh();
  return { ok: true };
}
