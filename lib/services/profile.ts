'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { profileSchema } from '@/lib/validation/schemas';

/**
 * Updates the caller's own profile (was profiles_update_self). Only the
 * fields in profileSchema can change — never email, active or roles.
 */
export async function updateProfile(input: unknown) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Not authenticated' } as const;
  }

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const;
  }

  // Omitted optional fields stay unchanged (undefined would bind as NULL).
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) patch[k] = v;
  }

  const { error } = await attempt(() => db.update('profiles', patch, 'id = @uid', { uid: user.id }));

  if (error) {
    return { error } as const;
  }

  revalidatePath('/profile');
  return { ok: true } as const;
}
