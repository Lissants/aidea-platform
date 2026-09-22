import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { IdeaDetailReadonly } from '@/components/ideas/idea-detail-readonly';
import { ReviewForm } from '@/components/reviews/review-form';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Review' };

export default async function ReviewDetailPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const supabase = await createClient();

  // RLS (review_assignments_mentor_select) already scopes this to the
  // assigned mentor or an admin — a mismatched mentor gets no row back.
  const { data: assignment } = await supabase
    .from('review_assignments')
    .select('id, idea_id, status')
    .eq('id', assignmentId)
    .maybeSingle();

  if (!assignment) notFound();

  const [{ data: idea }, { data: teamMembers }, { data: impacts }, { data: supportRequests }, { data: mentorPrefs }, { data: review }] =
    await Promise.all([
      supabase.from('ideas').select('*').eq('id', assignment.idea_id).single(),
      supabase.from('idea_team_members').select('profiles(full_name)').eq('idea_id', assignment.idea_id),
      supabase.from('idea_impacts').select('*').eq('idea_id', assignment.idea_id),
      supabase.from('idea_support_requests').select('*').eq('idea_id', assignment.idea_id),
      supabase
        .from('idea_mentor_preferences')
        .select('priority, mentor_profiles(profiles(full_name))')
        .eq('idea_id', assignment.idea_id),
      supabase.from('reviews').select('*').eq('review_assignment_id', assignment.id).maybeSingle(),
    ]);

  if (!idea) notFound();

  const reviewStatus: 'not_started' | 'draft' | 'submitted' | 'reopened' = (review?.status as any) ?? 'not_started';

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <PageHeader title="Review" description={`${idea.idea_title} — ${idea.team_name}`} />
        <IdeaDetailReadonly
          idea={{
            idea_title: idea.idea_title,
            team_name: idea.team_name,
            problem_opportunity: idea.problem_opportunity,
            proposed_solution: idea.proposed_solution,
            target_users: idea.target_users,
            team_members: (teamMembers ?? []).map((m: any) => ({ full_name: m.profiles?.full_name ?? 'Unknown' })),
            impacts: impacts ?? [],
            support_requests: supportRequests ?? [],
            mentor_preferences: (mentorPrefs ?? []).map((p: any) => ({
              priority: p.priority,
              mentor_name: p.mentor_profiles?.profiles?.full_name ?? 'Unknown',
            })),
          }}
        />
      </div>
      <div>
        <div className="mb-6 hidden lg:block" aria-hidden style={{ height: '2.75rem' }} />
        <ReviewForm
          assignmentId={assignment.id}
          ideaId={assignment.idea_id}
          initial={{
            desirability: review?.desirability ?? null,
            viability: review?.viability ?? null,
            realistic_implementation: review?.realistic_implementation ?? null,
            recommendation: review?.recommendation ?? null,
            comment: review?.comment ?? null,
          }}
          reviewStatus={reviewStatus}
          reopenReason={review?.reopen_reason ?? null}
        />
      </div>
    </div>
  );
}
