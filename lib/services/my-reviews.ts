import { attempt, db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { ideaReadFilter, reviewAssignmentReadFilter, reviewReadFilter } from '@/lib/permissions/scopes';

export type ReviewQueueTab = 'all' | 'pending' | 'draft' | 'submitted' | 'reopened';

export interface ReviewQueueRow {
  assignment_id: string;
  idea_id: string;
  idea_title: string;
  team_name: string;
  submitted_at: string | null;
  review_id: string | null;
  review_status: 'not_started' | 'draft' | 'submitted' | 'reopened';
  reopen_reason: string | null;
}

/**
 * My Reviews queue for the signed-in mentor: pending + completed assignments.
 * Scoped to assignments on the caller's own mentor profile (admins: any),
 * and only the caller's own review rows — same as the old RLS policies.
 */
export async function fetchMyReviewQueue(mentorProfileId: string): Promise<ReviewQueueRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const raScope = reviewAssignmentReadFilter(user, 'ra');
  const ideaScope = ideaReadFilter(user, 'i');
  const reviewScope = reviewReadFilter(user, 'r');

  const { data, error } = await attempt(() =>
    db.query<{
      id: string;
      idea_id: string;
      idea_title: string | null;
      team_name: string | null;
      submitted_at: string | null;
      review_id: string | null;
      review_status: ReviewQueueRow['review_status'] | null;
      reopen_reason: string | null;
    }>(
      `SELECT ra.id, ra.idea_id,
              i.idea_title, i.team_name, i.submitted_at,
              r.id AS review_id, r.status AS review_status, r.reopen_reason
         FROM review_assignments ra
         LEFT JOIN ideas i ON i.id = ra.idea_id AND ${ideaScope.sql}
         LEFT JOIN reviews r ON r.review_assignment_id = ra.id AND ${reviewScope.sql}
        WHERE ra.mentor_profile_id = @mentorProfileId AND ${raScope.sql}
        ORDER BY ra.assigned_at DESC`,
      { mentorProfileId, ...raScope.params, ...ideaScope.params, ...reviewScope.params }
    )
  );

  if (error || !data) return [];

  return data.map((a) => ({
    assignment_id: a.id,
    idea_id: a.idea_id,
    idea_title: a.idea_title ?? 'Untitled',
    team_name: a.team_name ?? '',
    submitted_at: a.submitted_at ?? null,
    review_id: a.review_id ?? null,
    review_status: a.review_status ?? 'not_started',
    reopen_reason: a.reopen_reason ?? null,
  }));
}

export function filterQueueByTab(rows: ReviewQueueRow[], tab: ReviewQueueTab): ReviewQueueRow[] {
  if (tab === 'all') return rows;
  if (tab === 'pending') return rows.filter((r) => r.review_status === 'not_started');
  return rows.filter((r) => r.review_status === tab);
}
