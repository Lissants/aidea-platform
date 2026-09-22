'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { reviewSchema } from '@/lib/validation/schemas';

/**
 * Saves a mentor's review as a draft. Upserts on review_assignment_id
 * (unique per 0009_reviews_unique_assignment.sql) so this works whether the
 * mentor has an existing draft row or is starting the review for the first
 * time — no separate "create" step needed. RLS
 * (mentors_modify_own_nonsubmitted_reviews) is what actually enforces that
 * this only succeeds for the assigned mentor, and only while
 * draft/reopened.
 */
export async function saveReviewDraft(
  reviewAssignmentId: string,
  ideaId: string,
  input: Partial<{
    desirability: boolean;
    viability: boolean;
    realistic_implementation: boolean;
    recommendation: 'recommend_pass' | 'recommend_not_pass';
    comment: string;
  }>
) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' } as const;

  const supabase = createClient();
  const { error } = await supabase
    .from('reviews')
    .upsert(
      {
        review_assignment_id: reviewAssignmentId,
        idea_id: ideaId,
        reviewer_id: user.id,
        ...input,
      },
      { onConflict: 'review_assignment_id' }
    );

  if (error) return { error: error.message } as const;

  revalidatePath('/reviews');
  revalidatePath(`/reviews/${reviewAssignmentId}`);
  return { ok: true } as const;
}

/**
 * Final submit. Ensures the current form values are saved first, then
 * delegates the draft/reopened -> submitted transition to fn_submit_review
 * (supabase/migrations/0007_functions.sql) rather than flipping the status
 * from application code.
 */
export async function submitReview(
  reviewAssignmentId: string,
  ideaId: string,
  input: {
    desirability: boolean;
    viability: boolean;
    realistic_implementation: boolean;
    recommendation: 'recommend_pass' | 'recommend_not_pass';
    comment: string;
  }
) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' } as const;

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const;
  }

  const supabase = createClient();

  const { data: saved, error: saveError } = await supabase
    .from('reviews')
    .upsert(
      {
        review_assignment_id: reviewAssignmentId,
        idea_id: ideaId,
        reviewer_id: user.id,
        ...parsed.data,
      },
      { onConflict: 'review_assignment_id' }
    )
    .select('id')
    .single();

  if (saveError) return { error: saveError.message } as const;

  const { error: submitError } = await supabase.rpc('fn_submit_review', { p_review_id: saved.id });
  if (submitError) return { error: submitError.message } as const;

  revalidatePath('/reviews');
  revalidatePath('/dashboard');
  revalidatePath(`/reviews/${reviewAssignmentId}`);
  return { ok: true } as const;
}
