'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db, DbError, newId, type Queryable } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { reviewSchema } from '@/lib/validation/schemas';

type ReviewFields = Partial<{
  desirability: boolean;
  viability: boolean;
  business_impact: boolean;
  realistic_implementation: boolean;
  recommendation: 'recommend_pass' | 'recommend_not_pass';
  comment: string;
}>;

const REVIEW_FIELDS = ['desirability', 'viability', 'business_impact', 'realistic_implementation', 'recommendation', 'comment'] as const;

/**
 * Creates or updates the caller's review row for an assignment, inside the
 * given transaction, and returns its id. Enforces what RLS used to
 * (review_assignments_mentor_select + mentors_modify_own_nonsubmitted_reviews):
 * the assignment must belong to the caller's own mentor profile, the idea
 * must be the assignment's idea, and an existing review must be the
 * caller's (reviewer_id) and still draft/reopened. Reviews are unique per
 * review_assignment_id, so this is an upsert on that key.
 */
async function upsertOwnReview(
  tx: Queryable,
  userId: string,
  reviewAssignmentId: string,
  ideaId: string,
  input: ReviewFields
): Promise<string> {
  const assignment = await tx.queryOne<{ idea_id: string }>(
    `SELECT ra.idea_id
       FROM review_assignments ra WITH (UPDLOCK, ROWLOCK)
       JOIN mentor_profiles mp ON mp.id = ra.mentor_profile_id
      WHERE ra.id = @reviewAssignmentId AND mp.profile_id = @uid`,
    { reviewAssignmentId, uid: userId }
  );
  if (!assignment) throw new DbError('Not authorized to review this idea');
  if (assignment.idea_id !== ideaId.toLowerCase()) throw new DbError('Idea does not match this review assignment');

  const patch: Record<string, unknown> = {};
  for (const key of REVIEW_FIELDS) if (input[key] !== undefined) patch[key] = input[key];

  const existing = await tx.queryOne<{ id: string; reviewer_id: string; status: string }>(
    `SELECT id, reviewer_id, status FROM reviews WITH (UPDLOCK, HOLDLOCK)
      WHERE review_assignment_id = @reviewAssignmentId`,
    { reviewAssignmentId }
  );

  if (!existing) {
    const id = newId();
    await tx.insert('reviews', {
      id,
      review_assignment_id: reviewAssignmentId,
      idea_id: assignment.idea_id,
      reviewer_id: userId,
      ...patch,
    });
    return id;
  }

  if (existing.reviewer_id !== userId) throw new DbError('Not authorized to edit this review');
  if (existing.status !== 'draft' && existing.status !== 'reopened') {
    throw new DbError('This review has already been submitted and can no longer be edited');
  }
  await tx.update('reviews', patch, `id = @reviewId AND reviewer_id = @uid AND status IN ('draft', 'reopened')`, {
    reviewId: existing.id,
    uid: userId,
  });
  return existing.id;
}

/**
 * Saves a mentor's review as a draft. Upserts on review_assignment_id
 * (unique per 0009_reviews_unique_assignment.sql) so this works whether the
 * mentor has an existing draft row or is starting the review for the first
 * time — no separate "create" step needed. Only succeeds for the assigned
 * mentor, and only while the review is draft/reopened (see upsertOwnReview).
 */
export async function saveReviewDraft(
  reviewAssignmentId: string,
  ideaId: string,
  input: Partial<{
    desirability: boolean;
    viability: boolean;
    business_impact: boolean;
    realistic_implementation: boolean;
    recommendation: 'recommend_pass' | 'recommend_not_pass';
    comment: string;
  }>
) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' } as const;

  const { error } = await attempt(() =>
    db.transaction((tx) => upsertOwnReview(tx, user.id, reviewAssignmentId, ideaId, input))
  );
  if (error) return { error } as const;

  revalidatePath('/reviews');
  revalidatePath(`/reviews/${reviewAssignmentId}`);
  return { ok: true } as const;
}

/**
 * Final submit. Ensures the current form values are saved first, then
 * delegates the draft/reopened -> submitted transition to usp_submit_review
 * (db/migrations/0003_procedures.sql, which also checks the caller is the
 * reviewer) rather than flipping the status from application code.
 */
export async function submitReview(
  reviewAssignmentId: string,
  ideaId: string,
  input: {
    desirability: boolean;
    viability: boolean;
    business_impact: boolean;
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

  const saved = await attempt(() =>
    db.transaction((tx) => upsertOwnReview(tx, user.id, reviewAssignmentId, ideaId, parsed.data))
  );
  if (saved.error) return { error: saved.error } as const;

  const { error: submitError } = await attempt(() =>
    db.callProc('usp_submit_review', { review_id: saved.data, actor_id: user.id })
  );
  if (submitError) return { error: submitError } as const;

  revalidatePath('/reviews');
  revalidatePath('/dashboard');
  revalidatePath(`/reviews/${reviewAssignmentId}`);
  return { ok: true } as const;
}
