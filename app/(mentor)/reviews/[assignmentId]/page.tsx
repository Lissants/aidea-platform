import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { IdeaDetailReadonly } from '@/components/ideas/idea-detail-readonly';
import { ReviewForm } from '@/components/reviews/review-form';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin, isMentor } from '@/lib/permissions';
import {
  ideaDetailReadFilter,
  ideaReadFilter,
  profileReadFilter,
  reviewAssignmentReadFilter,
  reviewReadFilter,
} from '@/lib/permissions/scopes';
import type { Idea, IdeaImpact, IdeaSupportRequest, Review } from '@/types/database';

export const metadata = { title: 'Review' };

export default async function ReviewDetailPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  // Scoped like the old review_assignments_mentor_select policy: only the
  // assigned mentor or an admin — a mismatched mentor gets no row back.
  const raScope = reviewAssignmentReadFilter(user, 'ra');
  const assignment = await db.queryOne<{ id: string; idea_id: string; status: string }>(
    `SELECT ra.id, ra.idea_id, ra.status FROM review_assignments ra
      WHERE ra.id = @assignmentId AND ${raScope.sql}`,
    { assignmentId, ...raScope.params }
  );

  if (!assignment) notFound();

  const ideaId = assignment.idea_id;
  const ideaScope = ideaReadFilter(user, 'i');
  const detailScope = ideaDetailReadFilter(user, 'i');
  const profileScope = profileReadFilter(user, 'p');
  const reviewScope = reviewReadFilter(user, 'r');
  const staff = isAdmin(user.roles) || isMentor(user.roles);
  // idea_team_members / idea_mentor_preferences were readable by mentors and
  // admins (plus the idea's own team / owner respectively).
  const teamScope = staff ? '1 = 1' : 'dbo.fn_is_idea_team_member(itm.idea_id, @uid) = 1';
  const prefScope = staff ? '1 = 1' : 'EXISTS (SELECT 1 FROM ideas oi WHERE oi.id = imp.idea_id AND oi.created_by = @uid)';

  const [idea, teamMembers, impacts, supportRequests, mentorPrefs, review] = await Promise.all([
    db.queryOne<Idea>(`SELECT i.* FROM ideas i WHERE i.id = @ideaId AND ${ideaScope.sql}`, { ideaId, ...ideaScope.params }),
    db.query<{ full_name: string | null }>(
      `SELECT p.full_name
         FROM idea_team_members itm
         LEFT JOIN profiles p ON p.id = itm.profile_id AND ${profileScope.sql}
        WHERE itm.idea_id = @ideaId AND ${teamScope}
        ORDER BY itm.member_order`,
      { ideaId, uid: user.id, ...profileScope.params }
    ),
    db.query<IdeaImpact>(
      `SELECT ii.* FROM idea_impacts ii JOIN ideas i ON i.id = ii.idea_id
        WHERE ii.idea_id = @ideaId AND ${detailScope.sql}`,
      { ideaId, ...detailScope.params }
    ),
    db.query<IdeaSupportRequest>(
      `SELECT isr.* FROM idea_support_requests isr JOIN ideas i ON i.id = isr.idea_id
        WHERE isr.idea_id = @ideaId AND ${detailScope.sql}`,
      { ideaId, ...detailScope.params }
    ),
    db.query<{ priority: number; full_name: string | null }>(
      `SELECT imp.priority, p.full_name
         FROM idea_mentor_preferences imp
         LEFT JOIN mentor_profiles mp ON mp.id = imp.mentor_profile_id
         LEFT JOIN profiles p ON p.id = mp.profile_id AND ${profileScope.sql}
        WHERE imp.idea_id = @ideaId AND ${prefScope}
        ORDER BY imp.priority`,
      { ideaId, uid: user.id, ...profileScope.params }
    ),
    db.queryOne<Review>(
      `SELECT r.* FROM reviews r WHERE r.review_assignment_id = @assignmentId AND ${reviewScope.sql}`,
      { assignmentId: assignment.id, ...reviewScope.params }
    ),
  ]);

  if (!idea) notFound();

  const reviewStatus: 'not_started' | 'draft' | 'submitted' | 'reopened' = review?.status ?? 'not_started';

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
            team_members: teamMembers.map((m) => ({ full_name: m.full_name ?? 'Unknown' })),
            impacts,
            support_requests: supportRequests,
            mentor_preferences: mentorPrefs.map((p) => ({
              priority: p.priority,
              mentor_name: p.full_name ?? 'Unknown',
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
            business_impact: review?.business_impact ?? null,
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
