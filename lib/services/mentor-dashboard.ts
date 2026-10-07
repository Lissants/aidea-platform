import { attempt, db, likeContains } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin, isMentor } from '@/lib/permissions';
import { ideaReadFilter, reviewAssignmentReadFilter, reviewReadFilter } from '@/lib/permissions/scopes';
import type { StatusKey } from '@/lib/constants/status';
import { PUBLISHED_RESULTS_SELECT, publishedResultsJoins, type PublishedResults } from '@/lib/ideas/published-results';
import type { ImpactType } from '@/types/database';

export interface DashboardIdeaRow extends PublishedResults {
  id: string;
  idea_title: string;
  team_name: string;
  submitted_at: string | null;
  impact_types: ImpactType[];
  workflow_status: StatusKey;
  assignment_status: string | null;
  reviewer_name: string | null;
  presentation_url: string | null;
  presentation_name: string | null;
}

interface DashboardFilters {
  search?: string;
  impactType?: ImpactType | 'all';
  status?: StatusKey | 'all';
  page?: number;
  pageSize?: number;
}

/**
 * Idea Dashboard read model for mentors: every submitted idea, with a
 * derived workflow status plus the published-only screening / qualifier
 * outcome and project mentor (lib/ideas/published-results.ts). The product
 * rule is that mentors only see the actual decision once it's published;
 * unpublished decisions surface only as "awaiting publication" and N/A.
 *
 * The joined rows are scoped exactly as the old RLS policies did: review
 * assignments and reviews only the caller's own (admins: all), screening
 * decisions for mentors/admins, qualifier assessments for admins (or the
 * idea's own team once published).
 */
export async function fetchMentorDashboard(programId: string, filters: DashboardFilters = {}) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;

  const user = await getCurrentUser();
  if (!user) return { rows: [], total: 0 };

  const admin = isAdmin(user.roles);
  const staff = admin || isMentor(user.roles);
  const ideaScope = ideaReadFilter(user, 'i');
  const raScope = reviewAssignmentReadFilter(user, 'ra');
  const reviewScope = reviewReadFilter(user, 'r');
  const ownTeam = `(i.created_by = @uid OR dbo.fn_is_idea_team_member(i.id, @uid) = 1)`;

  const search = filters.search ? likeContains(filters.search) : null;
  const params = {
    programId,
    uid: user.id,
    staff,
    admin,
    q: search,
    ...ideaScope.params,
    ...raScope.params,
    ...reviewScope.params,
  };

  const { data, error } = await attempt(() =>
    db.query<{
      id: string;
      idea_title: string;
      team_name: string;
      submitted_at: string | null;
      assignment_id: string | null;
      assignment_status: string | null;
      review_status: string | null;
      screening_id: string | null;
      screening_published: boolean | null;
      qualifier_id: string | null;
      qualifier_published: boolean | null;
      presentation_url: string | null;
      presentation_name: string | null;
    } & PublishedResults>(
      `SELECT i.id, i.idea_title, i.team_name, i.submitted_at, i.presentation_url, i.presentation_name,
              ra.id AS assignment_id, ra.status AS assignment_status,
              rv.status AS review_status,
              sd.id AS screening_id, sd.published AS screening_published,
              qa.id AS qualifier_id, qa.published AS qualifier_published,
              ${PUBLISHED_RESULTS_SELECT}
         FROM ideas i
         ${publishedResultsJoins('i')}
         LEFT JOIN review_assignments ra ON ra.idea_id = i.id AND ${raScope.sql}
         OUTER APPLY (SELECT TOP (1) r.status FROM reviews r
                       WHERE r.idea_id = i.id AND ${reviewScope.sql}
                       ORDER BY r.created_at DESC) rv
         LEFT JOIN screening_decisions sd ON sd.idea_id = i.id
               AND (@staff = 1 OR (sd.published = 1 AND ${ownTeam}))
         LEFT JOIN qualifier_assessments qa ON qa.idea_id = i.id
               AND (@admin = 1 OR (qa.published = 1 AND ${ownTeam}))
        WHERE i.program_id = @programId
          AND i.status = 'submitted'
          AND ${ideaScope.sql}
          AND (@q IS NULL OR i.idea_title LIKE @q OR i.team_name LIKE @q)
        ORDER BY i.submitted_at DESC`,
      params
    )
  );
  if (error || !data) return { rows: [], total: 0 };

  const impacts = await db.query<{ idea_id: string; impact_type: ImpactType }>(
    `SELECT ii.idea_id, ii.impact_type
       FROM idea_impacts ii
       JOIN ideas i ON i.id = ii.idea_id
      WHERE i.program_id = @programId AND i.status = 'submitted'`,
    { programId }
  );
  const impactsByIdea = new Map<string, ImpactType[]>();
  for (const imp of impacts) {
    const list = impactsByIdea.get(imp.idea_id) ?? [];
    list.push(imp.impact_type);
    impactsByIdea.set(imp.idea_id, list);
  }

  let rows: DashboardIdeaRow[] = data.map((idea) => {
    const impactTypes = impactsByIdea.get(idea.id) ?? [];
    const hasAssignment = idea.assignment_id !== null;
    const assignmentStatus: string | null = idea.assignment_status ?? null;

    let workflow_status: StatusKey = 'waiting_assignment';

    if (assignmentStatus === 'routing_required') {
      workflow_status = 'routing_required';
    } else if (!hasAssignment) {
      workflow_status = 'waiting_assignment';
    } else if (idea.review_status !== 'submitted') {
      workflow_status = 'waiting_for_review';
    } else if (idea.qualifier_id !== null) {
      workflow_status = idea.qualifier_published ? 'published' : 'awaiting_publication';
    } else if (idea.screening_id !== null) {
      workflow_status = idea.screening_published ? 'published' : 'awaiting_publication';
    } else {
      workflow_status = 'review_completed';
    }

    return {
      id: idea.id,
      idea_title: idea.idea_title,
      team_name: idea.team_name,
      submitted_at: idea.submitted_at,
      impact_types: impactTypes,
      workflow_status,
      assignment_status: assignmentStatus,
      reviewer_name: null,
      screening: idea.screening ?? null,
      qualifier: idea.qualifier ?? null,
      mentor_name: idea.mentor_name ?? null,
      presentation_url: idea.presentation_url,
      presentation_name: idea.presentation_name,
    };
  });

  if (filters.impactType && filters.impactType !== 'all') {
    rows = rows.filter((r) => r.impact_types.includes(filters.impactType as ImpactType));
  }
  if (filters.status && filters.status !== 'all') {
    rows = rows.filter((r) => r.workflow_status === filters.status);
  }

  const total = rows.length;
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  return { rows: paged, total };
}
