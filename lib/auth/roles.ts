import 'server-only';

import { newId, type Queryable } from '@/lib/db';
import { USER_TIERS, type UserTier } from '@/lib/constants/navigation';

/**
 * Roles for directory (AD / Entra) accounts. Every new account starts on the
 * User tier (`participant`) plus the automatic `employee_voter` role; admins
 * promote people in User Management afterwards. The emails listed in
 * AD_DEVELOPER_EMAILS / AD_ADMIN_EMAILS are put back on that tier at every
 * sign-in, and their tier can't be changed in the app.
 */

export const DEFAULT_TIER: UserTier = 'participant';

function emailList(name: 'AD_DEVELOPER_EMAILS' | 'AD_ADMIN_EMAILS') {
  return (process.env[name] ?? '')
    .split(/[,;]/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** The emails whose tier comes from server settings, for the admin settings page. */
export function settingsAssignedEmails() {
  return { developers: emailList('AD_DEVELOPER_EMAILS'), admins: emailList('AD_ADMIN_EMAILS') };
}

/** Tier fixed in server settings for this email (Developer wins over Admin), else null. */
export function assignedTier(email: string): Extract<UserTier, 'developer' | 'admin'> | null {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  if (emailList('AD_DEVELOPER_EMAILS').includes(key)) return 'developer';
  if (emailList('AD_ADMIN_EMAILS').includes(key)) return 'admin';
  return null;
}

export async function ensureMentorProfile(q: Queryable, profileId: string) {
  await q.execute(
    `IF NOT EXISTS (SELECT 1 FROM mentor_profiles WHERE profile_id = @profileId)
       INSERT INTO mentor_profiles (id, profile_id) VALUES (@id, @profileId)`,
    { id: newId(), profileId }
  );
}

/** Replaces the user's single tier role; leaves employee_voter (and anything else) alone. */
export async function setTierRole(q: Queryable, userId: string, tier: UserTier) {
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

/** Adds the automatic employee_voter role if the user doesn't have it yet. */
export async function ensureEmployeeVoter(q: Queryable, userId: string) {
  await q.execute(
    `INSERT INTO user_roles (id, user_id, role_id)
     SELECT @id, @userId, r.id FROM roles r
      WHERE r.name = 'employee_voter'
        AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = @userId AND ur.role_id = r.id)`,
    { id: newId(), userId }
  );
}
