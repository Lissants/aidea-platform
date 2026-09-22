import { createClient } from '@/lib/supabase/server';

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

/** My Reviews queue for the signed-in mentor: pending + completed assignments. */
export async function fetchMyReviewQueue(mentorProfileId: string): Promise<ReviewQueueRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('review_assignments')
    .select(
      `id, idea_id, status,
       ideas (idea_title, team_name, submitted_at),
       reviews (id, status, reopen_reason)`
    )
    .eq('mentor_profile_id', mentorProfileId)
    .order('assigned_at', { ascending: false });

  if (error || !data) return [];

  return (data as any[]).map((a) => {
    const review = a.reviews?.[0] ?? a.reviews ?? null;
    return {
      assignment_id: a.id,
      idea_id: a.idea_id,
      idea_title: a.ideas?.idea_title ?? 'Untitled',
      team_name: a.ideas?.team_name ?? '',
      submitted_at: a.ideas?.submitted_at ?? null,
      review_id: review?.id ?? null,
      review_status: review?.status ?? 'not_started',
      reopen_reason: review?.reopen_reason ?? null,
    };
  });
}

export function filterQueueByTab(rows: ReviewQueueRow[], tab: ReviewQueueTab): ReviewQueueRow[] {
  if (tab === 'all') return rows;
  if (tab === 'pending') return rows.filter((r) => r.review_status === 'not_started');
  return rows.filter((r) => r.review_status === tab);
}
