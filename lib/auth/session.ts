import { cache } from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getDefaultRole, type AppRole } from '@/lib/constants/navigation';
import type { Profile } from '@/types/database';

export interface SessionUser {
  id: string;
  email: string;
  profile: Profile | null;
  roles: AppRole[];
}

/**
 * Fetches the current signed-in user plus their roles (profiles + user_roles
 * joined through roles). Cached per-request with React `cache()` so multiple
 * Server Components/layouts on the same request don't refetch.
 *
 * Returns null when there is no session — callers (middleware, pages,
 * server actions) are responsible for redirecting/denying; this helper never
 * throws for "not signed in".
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .maybeSingle();

  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', authData.user.id);

  const roles = (roleRows ?? [])
    .map((r: any) => r.roles?.name)
    .filter((r: unknown): r is AppRole => typeof r === 'string');

  return {
    id: authData.user.id,
    email: authData.user.email ?? '',
    profile: profile ? (profile as unknown as Profile) : null,
    roles,
  };
});

const ACTIVE_ROLE_COOKIE = 'aidea_active_role';

/**
 * Resolves which role the AppShell should render as: the cookie-persisted
 * "acting as" choice if it's still a role the user holds, otherwise the
 * highest-privilege role (Admin > Mentor > Participant > Employee Voter).
 */
export function getActiveRole(user: SessionUser): AppRole | null {
  const cookieRole = cookies().get(ACTIVE_ROLE_COOKIE)?.value as AppRole | undefined;
  if (cookieRole && user.roles.includes(cookieRole)) {
    return cookieRole;
  }
  return getDefaultRole(user.roles);
}

export { ACTIVE_ROLE_COOKIE };
