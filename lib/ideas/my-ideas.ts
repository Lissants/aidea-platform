import 'server-only';
import { db } from '@/lib/db';
import { PUBLISHED_RESULTS_SELECT, publishedResultsJoins } from '@/lib/ideas/published-results';
import type { MyIdeaRow } from '@/types/database';

/**
 * Ideas the user created, leads or is a team member of, with published-only
 * results. Shared by My Ideas and the participant overview so both always
 * show the same set.
 */
export async function fetchMyIdeas(userId: string): Promise<MyIdeaRow[]> {
  return db.query<MyIdeaRow>(
    `SELECT i.*, ${PUBLISHED_RESULTS_SELECT},
            CASE WHEN i.team_leader_id = @uid THEN 'leader'
                 WHEN EXISTS (SELECT 1 FROM idea_team_members m WHERE m.idea_id = i.id AND m.profile_id = @uid) THEN 'member'
                 ELSE 'creator' END AS my_role,
            CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.v_approved_ideas a WHERE a.idea_id = i.id) THEN 1 ELSE 0 END AS BIT) AS approved
       FROM ideas i
       ${publishedResultsJoins('i')}
      WHERE i.created_by = @uid
         OR i.team_leader_id = @uid
         OR EXISTS (SELECT 1 FROM idea_team_members m WHERE m.idea_id = i.id AND m.profile_id = @uid)
      ORDER BY i.created_at DESC`,
    { uid: userId }
  );
}
