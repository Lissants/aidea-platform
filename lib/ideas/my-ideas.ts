import 'server-only';
import { db } from '@/lib/db';
import { PUBLISHED_RESULTS_SELECT, publishedResultsJoins } from '@/lib/ideas/published-results';
import type { MyIdeaDetail, MyIdeaRow } from '@/types/database';

/** How My Ideas and the idea detail page describe the viewer's place on an idea. */
export const MY_ROLE_LABEL: Record<MyIdeaRow['my_role'], string> = {
  leader: 'Team leader',
  member: 'Team member',
  creator: 'Creator (not on team)',
};

/** Same "is this my idea" rule as fetchMyIdeas: creator, leader or member. */
const MY_IDEA_WHERE = `(i.created_by = @uid
         OR i.team_leader_id = @uid
         OR EXISTS (SELECT 1 FROM idea_team_members m WHERE m.idea_id = i.id AND m.profile_id = @uid))`;

const MY_ROLE_SELECT = `CASE WHEN i.team_leader_id = @uid THEN 'leader'
                 WHEN EXISTS (SELECT 1 FROM idea_team_members m WHERE m.idea_id = i.id AND m.profile_id = @uid) THEN 'member'
                 ELSE 'creator' END AS my_role`;

/**
 * Ideas the user created, leads or is a team member of, with published-only
 * results. Shared by My Ideas and the participant overview so both always
 * show the same set.
 */
export async function fetchMyIdeas(userId: string): Promise<MyIdeaRow[]> {
  return db.query<MyIdeaRow>(
    `SELECT i.*, ${PUBLISHED_RESULTS_SELECT},
            ${MY_ROLE_SELECT},
            CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.v_approved_ideas a WHERE a.idea_id = i.id) THEN 1 ELSE 0 END AS BIT) AS approved
       FROM ideas i
       ${publishedResultsJoins('i')}
      WHERE ${MY_IDEA_WHERE}
      ORDER BY i.created_at DESC`,
    { uid: userId }
  );
}

/**
 * One of the user's ideas in full, for the participant detail page. Returns
 * null when the idea doesn't exist or isn't theirs (the page 404s either way,
 * so an outsider can't tell the two apart). Results are published-only;
 * review status, reviewer and internal reasons are never loaded.
 */
export async function fetchMyIdeaDetail(ideaId: string, userId: string): Promise<MyIdeaDetail | null> {
  const idea = await db.queryOne<{
    id: string;
    idea_title: string;
    team_name: string;
    problem_opportunity: string;
    proposed_solution: string;
    target_users: string | null;
    status: MyIdeaDetail['status'];
    created_by: string;
    my_role: MyIdeaDetail['my_role'];
    screening: MyIdeaDetail['screening'];
    qualifier: MyIdeaDetail['qualifier'];
    mentor_name: string | null;
    team_leader_id: string | null;
    team_leader_name: string | null;
    presentation_url: string | null;
    presentation_name: string | null;
    presentation_uploaded_at: string | null;
    screening_presentation_url: string | null;
    screening_presentation_name: string | null;
    screening_presentation_uploaded_at: string | null;
  }>(
    `SELECT i.id, i.idea_title, i.team_name, i.problem_opportunity, i.proposed_solution, i.target_users,
            i.status, i.created_by, i.team_leader_id, lp.full_name AS team_leader_name,
            i.presentation_url, i.presentation_name, i.presentation_uploaded_at,
            i.screening_presentation_url, i.screening_presentation_name, i.screening_presentation_uploaded_at,
            ${PUBLISHED_RESULTS_SELECT},
            ${MY_ROLE_SELECT}
       FROM ideas i
       LEFT JOIN profiles lp ON lp.id = i.team_leader_id
       ${publishedResultsJoins('i')}
      WHERE i.id = @ideaId AND ${MY_IDEA_WHERE}`,
    { ideaId, uid: userId }
  );
  if (!idea) return null;

  const [teamMembers, impacts, supportRequests, mentorPrefs] = await Promise.all([
    db.query<{ full_name: string | null }>(
      `SELECT p.full_name FROM idea_team_members itm LEFT JOIN profiles p ON p.id = itm.profile_id
        WHERE itm.idea_id = @ideaId ORDER BY itm.member_order`,
      { ideaId }
    ),
    db.query<MyIdeaDetail['impacts'][number]>(
      'SELECT impact_kind, impact_type, explanation, measurable_result FROM idea_impacts WHERE idea_id = @ideaId',
      { ideaId }
    ),
    db.query<MyIdeaDetail['support_requests'][number]>(
      'SELECT support_area, details, reason, estimate FROM idea_support_requests WHERE idea_id = @ideaId',
      { ideaId }
    ),
    db.query<{ priority: number; full_name: string | null }>(
      `SELECT imp.priority, p.full_name
         FROM idea_mentor_preferences imp
         LEFT JOIN mentor_profiles mp ON mp.id = imp.mentor_profile_id
         LEFT JOIN profiles p ON p.id = mp.profile_id
        WHERE imp.idea_id = @ideaId
        ORDER BY imp.priority`,
      { ideaId }
    ),
  ]);

  return {
    id: idea.id,
    idea_title: idea.idea_title,
    team_name: idea.team_name,
    problem_opportunity: idea.problem_opportunity,
    proposed_solution: idea.proposed_solution,
    target_users: idea.target_users,
    status: idea.status,
    created_by: idea.created_by,
    my_role: idea.my_role,
    screening: idea.screening,
    qualifier: idea.qualifier,
    mentor_name: idea.mentor_name,
    team_leader: idea.team_leader_id ? { full_name: idea.team_leader_name ?? 'Unknown' } : null,
    team_members: teamMembers.map((m) => ({ full_name: m.full_name ?? 'Unknown' })),
    impacts,
    support_requests: supportRequests,
    mentor_preferences: mentorPrefs.map((p) => ({ priority: p.priority, mentor_name: p.full_name ?? 'Unknown' })),
    screening_presentation: idea.screening_presentation_url
      ? {
          url: idea.screening_presentation_url,
          name: idea.screening_presentation_name,
          uploaded_at: idea.screening_presentation_uploaded_at,
        }
      : null,
    presentation: idea.presentation_url
      ? { url: idea.presentation_url, name: idea.presentation_name, uploaded_at: idea.presentation_uploaded_at }
      : null,
  };
}
