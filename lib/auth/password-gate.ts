import 'server-only';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/lib/auth/session';

export const CHANGE_PASSWORD_PATH = '/profile/password';

/**
 * Layouts call this right after the auth check: an account flagged
 * must_change_password (created or reset by an admin) can reach nothing but
 * the change-password page until it picks its own password. It lives in the
 * layouts, not proxy.ts, because the proxy is cookie-only and never reads the DB.
 */
export function requireCurrentPassword(user: SessionUser) {
  if (user.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);
}
