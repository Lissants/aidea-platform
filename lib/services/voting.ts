'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { voteSchema } from '@/lib/validation/schemas';

/**
 * Casts a vote via fn_submit_vote (supabase/migrations/0007_functions.sql),
 * which checks the voting window is open and that the voter isn't on the
 * idea's own team, then relies on the unique(voting_period_id, voter_id)
 * constraint to guarantee one vote per voter — all inside one transaction.
 */
export async function castVote(input: unknown) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' } as const;

  const parsed = voteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_submit_vote', {
    p_voting_period_id: parsed.data.voting_period_id,
    p_voter_id: user.id,
    p_idea_id: parsed.data.idea_id,
  });

  if (error) return { error: error.message } as const;

  revalidatePath('/voting');
  return { ok: true } as const;
}
