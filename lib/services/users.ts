'use server';

import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { attempt, db, likeContains, newId, type Queryable } from '@/lib/db';
import { getCurrentUser, type SessionUser } from '@/lib/auth/session';
import { isAllowedEmail } from '@/lib/auth/email-domain';
import { logAudit } from '@/lib/audit/log';
import { USER_TIERS, type AppRole, type UserTier } from '@/lib/constants/navigation';
import { canManageUser, isAdmin, tierOf } from '@/lib/permissions';
import { changePasswordSchema, createUserSchema, type CreateUserInput } from '@/lib/validation/schemas';

/**
 * User management (create / change tier / deactivate / reset password / delete).
 *
 * Every action re-checks the caller itself (SECURITY.md: never trust the UI).
 * Who may touch whom is decided by canManageUser() in lib/permissions: a
 * Developer manages every tier, an Admin only User and Mentor accounts.
 * Accounts are never edited by raw role grants: a user sits on exactly one
 * tier (participant < mentor < admin < developer); `employee_voter` is an
 * extra role that tier changes never touch.
 */

const PAGE_SIZE = 50;
const BCRYPT_COST = 10;

export interface ManagedUser {
  user_id: string;
  full_name: string;
  email: string;
  tier: UserTier | null;
  active: boolean;
  must_change_password: boolean;
  last_sign_in_at: string | null;
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
  /** Tiers the caller may assign when creating a user. */
  creatableTiers: UserTier[];
}

type Result<T = object> = ({ ok: true } & T) | { error: string };

const NOT_AUTHORIZED = { error: 'Not authorized' } as const;

async function requireManager(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && isAdmin(user.roles) ? user : null;
}

/** Readable temp password; no look-alike characters (0/O, 1/l/I). */
function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const body = Array.from({ length: 14 }, () => alphabet[randomInt(alphabet.length)]).join('');
  return `${body}-${randomInt(10, 100)}`;
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

async function ensureMentorProfile(q: Queryable, profileId: string) {
  await q.execute(
    `IF NOT EXISTS (SELECT 1 FROM mentor_profiles WHERE profile_id = @profileId)
       INSERT INTO mentor_profiles (id, profile_id) VALUES (@id, @profileId)`,
    { id: newId(), profileId }
  );
}

/** Replaces the user's single tier role; leaves employee_voter (and anything else) alone. */
async function setTierRole(q: Queryable, userId: string, tier: UserTier) {
  await q.execute(
    `DELETE ur FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = @userId AND r.name IN (@tiers)`,
    { userId, tiers: USER_TIERS }
  );
  await q.execute(
    'INSERT INTO user_roles (id, user_id, role_id) SELECT @id, @userId, id FROM roles WHERE name = @tier',
    { id: newId(), userId, tier }
  );
  if (tier === 'mentor') await ensureMentorProfile(q, userId);
}

function refresh() {
  revalidatePath('/roles');
  revalidatePath('/audit');
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export async function fetchManagedUsers(search?: string, page = 1): Promise<ManagedUserPage> {
  const actor = await requireManager();
  const empty: ManagedUserPage = { users: [], total: 0, page: 1, pageSize: PAGE_SIZE, creatableTiers: [] };
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
    must_change_password: boolean;
    last_sign_in_at: Date | string | null;
  }>(
    `SELECT p.id, p.full_name, p.email, p.active, u.must_change_password, u.last_sign_in_at
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
    return {
      user_id: p.id,
      full_name: p.full_name,
      email: p.email,
      tier,
      active: p.active === true,
      must_change_password: p.must_change_password === true,
      last_sign_in_at: p.last_sign_in_at ? new Date(p.last_sign_in_at).toISOString() : null,
      canManage: manageable,
      isSelf,
      assignableTiers: manageable ? USER_TIERS.filter((t) => canManageUser(actor.roles, tier ?? 'participant', t)) : [],
    };
  });

  return {
    users,
    total: totalRow?.count ?? 0,
    page: safePage,
    pageSize: PAGE_SIZE,
    creatableTiers: USER_TIERS.filter((t) => canManageUser(actor.roles, t, t)),
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Creates an account with a temporary password the user must change at first sign-in. */
export async function createUser(input: CreateUserInput): Promise<Result<{ userId: string; tempPassword: string }>> {
  const actor = await requireManager();
  if (!actor) return NOT_AUTHORIZED;

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { email, fullName, employeeId, tier } = parsed.data;

  if (!canManageUser(actor.roles, tier, tier)) return { error: `You cannot create ${tier} accounts.` };
  if (!isAllowedEmail(email)) return { error: 'That email domain is not allowed to sign in to this platform.' };

  const taken = await db.queryOne(
    'SELECT 1 AS ok FROM users WHERE email = @email UNION SELECT 1 FROM profiles WHERE email = @email',
    { email }
  );
  if (taken) return { error: 'An account with that email already exists.' };

  const tempPassword = parsed.data.tempPassword ?? generateTempPassword();
  const hash = await bcrypt.hash(tempPassword, BCRYPT_COST);
  const userId = newId();

  const { error } = await attempt(() =>
    db.transaction(async (tx) => {
      await tx.execute(
        'INSERT INTO users (id, email, password_hash, must_change_password) VALUES (@id, @email, @hash, 1)',
        { id: userId, email, hash }
      );
      await tx.execute(
        'INSERT INTO profiles (id, employee_id, email, full_name, active) VALUES (@id, @employeeId, @email, @fullName, 1)',
        { id: userId, employeeId, email, fullName }
      );
      await setTierRole(tx, userId, tier);
      await tx.execute(
        `INSERT INTO user_roles (id, user_id, role_id) SELECT @id, @userId, id FROM roles WHERE name = 'employee_voter'`,
        { id: newId(), userId }
      );
    })
  );
  if (error) return { error };

  await logAudit({
    entityType: 'users',
    entityId: userId,
    actorId: actor.id,
    action: 'user_created',
    newValue: { email, full_name: fullName, tier },
  });
  refresh();
  return { ok: true, userId, tempPassword };
}

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

/** Sets a new temporary password (shown once) and forces a change at next sign-in. */
export async function resetUserPassword(userId: string): Promise<Result<{ tempPassword: string }>> {
  const actor = await requireManager();
  if (!actor) return NOT_AUTHORIZED;
  if (userId === actor.id) return { error: 'Use Change password on your own profile.' };

  const target = await loadTarget(db, userId);
  if (!target) return { error: 'User not found' };
  if (!canManageUser(actor.roles, target.tier ?? 'participant')) return { error: 'Not authorized to manage this user' };

  const tempPassword = generateTempPassword();
  const hash = await bcrypt.hash(tempPassword, BCRYPT_COST);
  const { error } = await attempt(() =>
    db.execute('UPDATE users SET password_hash = @hash, must_change_password = 1 WHERE id = @id', { id: userId, hash })
  );
  if (error) return { error };

  await logAudit({ entityType: 'users', entityId: userId, actorId: actor.id, action: 'user_password_reset' });
  refresh();
  return { ok: true, tempPassword };
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

/** Self-service password change; also clears the forced-change flag. */
export async function changeOwnPassword(input: unknown): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not signed in' };
  if (!user.hasPassword) return { error: 'Your account signs in with Microsoft and has no AIdea password.' };

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { currentPassword, newPassword } = parsed.data;

  const row = await db.queryOne<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = @id', {
    id: user.id,
  });
  if (!row?.password_hash || !(await bcrypt.compare(currentPassword, row.password_hash))) {
    return { error: 'Current password is incorrect' };
  }

  const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
  const { error } = await attempt(() =>
    db.execute('UPDATE users SET password_hash = @hash, must_change_password = 0 WHERE id = @id', { id: user.id, hash })
  );
  if (error) return { error };

  if (isAdmin(user.roles)) {
    await logAudit({ entityType: 'users', entityId: user.id, actorId: user.id, action: 'user_password_changed' });
  }
  return { ok: true };
}
