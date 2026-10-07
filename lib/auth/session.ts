import { cache } from 'react';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { getDefaultRole, type AppRole } from '@/lib/constants/navigation';
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from '@/lib/auth/session-cookie';
import type { Profile } from '@/types/database';

export interface SessionUser {
  id: string;
  email: string;
  profile: Profile | null;
  roles: AppRole[];
  /** Set when an admin created the account or reset its password. */
  mustChangePassword: boolean;
}

/**
 * Fetches the current signed-in user plus their roles (profiles + user_roles
 * joined through roles). Cached per-request with React `cache()` so multiple
 * Server Components/layouts on the same request don't refetch.
 *
 * Returns null when there is no valid session cookie, the user row no longer
 * exists, or the profile has been deactivated — callers (pages, server
 * actions, route handlers) are responsible for redirecting/denying; this
 * helper never throws for "not signed in".
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const claims = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;

  const account = await db.queryOne<{ id: string; email: string; must_change_password: boolean }>(
    'SELECT id, email, must_change_password FROM users WHERE id = @id',
    { id: claims.sub }
  );
  if (!account) return null;

  const profile = await db.queryOne<Profile>('SELECT * FROM profiles WHERE id = @id', { id: account.id });
  if (profile && profile.active === false) return null;

  const roleRows = await db.query<{ name: string }>(
    `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = @id`,
    { id: account.id }
  );

  return {
    id: account.id,
    email: account.email,
    profile: profile ?? null,
    roles: roleRows.map((r) => r.name as AppRole),
    mustChangePassword: account.must_change_password === true,
  };
});

/** Issues the session cookie for a verified user (Server Actions / Route Handlers only). */
export async function startSession(userId: string, email: string) {
  const token = await createSessionToken(userId, email);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
  await db.execute('UPDATE users SET last_sign_in_at = SYSDATETIMEOFFSET() WHERE id = @id', { id: userId });
}

/** Clears the session and the "acting as" role cookie. */
export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(ACTIVE_ROLE_COOKIE);
}

const ACTIVE_ROLE_COOKIE = 'aidea_active_role';

/**
 * Resolves which role the AppShell should render as: the cookie-persisted
 * "acting as" choice if it's still a role the user holds, otherwise the
 * highest-privilege role (Admin > Mentor > Participant > Employee Voter).
 */
export async function getActiveRole(user: SessionUser): Promise<AppRole | null> {
  const cookieRole = (await cookies()).get(ACTIVE_ROLE_COOKIE)?.value as AppRole | undefined;
  if (cookieRole && user.roles.includes(cookieRole)) {
    return cookieRole;
  }
  return getDefaultRole(user.roles);
}

export { ACTIVE_ROLE_COOKIE };
