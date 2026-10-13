import 'server-only';

import { getUserRoles } from '@/lib/auth/session';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { roleHomePath } from '@/lib/constants/navigation';

/** Paths that are not a real destination, so the user goes to their role's home instead. */
const NOT_A_DESTINATION = new Set(['/', '/sign-in']);

/**
 * Where to send a user who has just signed in: the page they asked for (a
 * same-origin deep link such as /reviews/123), otherwise their role's home
 * (/overview, or /voting for voters). Never an external URL.
 */
export async function postSignInPath(userId: string, requested: string | null | undefined): Promise<string> {
  const path = safeRedirectPath(requested);
  if (!NOT_A_DESTINATION.has(path.split(/[?#]/)[0])) return path;
  return roleHomePath(await getUserRoles(userId)) ?? '/access-denied';
}
