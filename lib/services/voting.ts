'use server';

import { revalidatePath } from 'next/cache';
import { db, DbError } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { voteSchema } from '@/lib/validation/schemas';

/**
 * Casts a vote via usp_submit_vote (db/migrations/0011_vote_candidates.sql),
 * which checks the voting period is published and open, that the idea is a
 * candidate (v_vote_candidates: published Pass + published Build, see
 * migration 0013) and that the voter isn't on the
 * idea's own team, then relies on the uq_votes_period_voter constraint to
 * guarantee one vote per voter. The voter is always the signed-in user —
 * never taken from the input.
 */
export async function castVote(input: unknown) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' } as const;

  const parsed = voteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const;
  }

  try {
    await db.callProc('usp_submit_vote', {
      voting_period_id: parsed.data.voting_period_id,
      voter_id: user.id,
      idea_id: parsed.data.idea_id,
    });
  } catch (err) {
    if (err instanceof DbError && err.isUniqueViolation) {
      return { error: 'You have already voted in this voting period.' } as const;
    }
    return { error: err instanceof Error ? err.message : 'Could not cast vote' } as const;
  }

  revalidatePath('/voting');
  return { ok: true } as const;
}
