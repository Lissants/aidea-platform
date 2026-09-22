'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { profileSchema } from '@/lib/validation/schemas';

export async function updateProfile(input: unknown) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Not authenticated' } as const;
  }

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const;
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    return { error: error.message } as const;
  }

  revalidatePath('/profile');
  return { ok: true } as const;
}
