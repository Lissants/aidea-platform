'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db, likeContains } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import { adminAddTeamMemberSchema, adminRemoveTeamMemberSchema } from '@/lib/validation/schemas';

/**
 * Team membership after approval (db/migrations/0009_team_membership.sql).
 * A person may be on any number of ideas until one of them is marked Build
 * (published qualifier decision, db/migrations/0012_commit_on_build.sql).
 * From then on they must commit to one Build idea and leave their other
 * in-progress ideas in that program. Admins handle later team changes (resignations, leave) by removing a
 * member and, after agreeing it offline with the team, assigning a
 * replacement. The procedures re-check every rule and write the audit rows.
 */

export interface ConflictIdea {
  idea_id: string;
  program_id: string;
  idea_title: string;
  team_name: string;
  my_role: 'leader' | 'member';
  /** Marked Build: the participant can commit to it. Other rows are ideas they would leave. */
  is_build: boolean;
  team: string[];
}

/**
 * The signed-in user's in-progress ideas, only for programs where at least
 * one of them is marked Build and there is another in-progress idea to leave.
 */
export async function fetchMyMembershipConflicts(): Promise<ConflictIdea[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await db.query<Omit<ConflictIdea, 'team'> & { team: string | null }>(
    `SELECT p.idea_id, p.program_id, i.idea_title, i.team_name, p.role AS my_role,
            CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.v_build_ideas b WHERE b.idea_id = p.idea_id)
                      THEN 1 ELSE 0 END AS BIT) AS is_build,
            (SELECT STRING_AGG(pr.full_name, N'|') WITHIN GROUP (ORDER BY t.role, pr.full_name)
               FROM dbo.v_idea_participants t JOIN profiles pr ON pr.id = t.profile_id
              WHERE t.idea_id = p.idea_id) AS team
       FROM dbo.v_idea_participants p
       JOIN dbo.v_open_ideas o ON o.idea_id = p.idea_id
       JOIN ideas i ON i.id = p.idea_id
      WHERE p.profile_id = @uid
        AND EXISTS (SELECT 1 FROM dbo.v_idea_participants p2
                      JOIN dbo.v_build_ideas b2 ON b2.idea_id = p2.idea_id
                     WHERE p2.profile_id = @uid AND p2.program_id = p.program_id)
        AND (SELECT COUNT(*) FROM dbo.v_idea_participants p3
               JOIN dbo.v_open_ideas o3 ON o3.idea_id = p3.idea_id
              WHERE p3.profile_id = @uid AND p3.program_id = p.program_id) > 1
      ORDER BY is_build DESC, i.idea_title`,
    { uid: user.id }
  );
  return rows.map((r) => ({ ...r, is_build: !!r.is_build, team: r.team ? r.team.split('|') : [] }));
}

/** Keep the Build idea `ideaId` and leave every other in-progress idea of its program (usp_commit_to_idea). */
export async function commitToIdea(ideaId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' } as const;

  const { data, error } = await attempt(() =>
    db.callProc<{ left_count: number }>('usp_commit_to_idea', { idea_id: ideaId, actor_id: user.id })
  );
  if (error) return { error } as const;

  revalidatePath('/my-ideas');
  revalidatePath('/overview');
  return { ok: true, leftCount: data?.[0]?.left_count ?? 0 } as const;
}

export async function adminRemoveTeamMember(ideaId: string, profileId: string, reason: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const parsed = adminRemoveTeamMemberSchema.safeParse({ idea_id: ideaId, profile_id: profileId, reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const;

  const { error } = await attempt(() =>
    db.callProc('usp_admin_remove_team_member', {
      idea_id: parsed.data.idea_id,
      profile_id: parsed.data.profile_id,
      reason: parsed.data.reason,
      actor_id: user.id,
    })
  );
  if (error) return { error } as const;

  revalidatePath(`/ideas/${ideaId}`);
  revalidatePath('/ideas');
  return { ok: true } as const;
}

export async function adminAddTeamMember(
  ideaId: string,
  profileId: string,
  opts: { asLeader: boolean; override: boolean; reason?: string | null }
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const parsed = adminAddTeamMemberSchema.safeParse({
    idea_id: ideaId,
    profile_id: profileId,
    as_leader: opts.asLeader,
    override: opts.override,
    reason: opts.reason ?? null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const;

  const { error } = await attempt(() =>
    db.callProc('usp_admin_add_team_member', {
      idea_id: parsed.data.idea_id,
      profile_id: parsed.data.profile_id,
      as_leader: parsed.data.as_leader,
      override: parsed.data.override,
      reason: parsed.data.reason || null,
      actor_id: user.id,
    })
  );
  if (error) return { error } as const;

  revalidatePath(`/ideas/${ideaId}`);
  revalidatePath('/ideas');
  return { ok: true } as const;
}

export interface ReplacementCandidate {
  id: string;
  full_name: string;
  email: string;
  /** Already on this idea's team (can only be promoted to leader). */
  on_this_team: boolean;
  /** A submitted idea in the same program this person is on, which makes them ineligible without an override. */
  conflict_idea_title: string | null;
}

/** Admin typeahead for the replacement dialog: active profiles with their eligibility for `ideaId`. */
export async function searchReplacementCandidates(ideaId: string, q: string): Promise<ReplacementCandidate[]> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return [];
  const term = q.trim().slice(0, 100);
  if (term.length < 2) return [];

  return db.query<ReplacementCandidate>(
    `SELECT TOP (10) pr.id, pr.full_name, pr.email,
            CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.v_idea_participants t
                                    WHERE t.idea_id = @ideaId AND t.profile_id = pr.id) THEN 1 ELSE 0 END AS BIT) AS on_this_team,
            c.idea_title AS conflict_idea_title
       FROM profiles pr
       CROSS JOIN (SELECT program_id FROM ideas WHERE id = @ideaId) me
      OUTER APPLY (SELECT TOP (1) i.idea_title
                     FROM dbo.v_idea_participants p JOIN ideas i ON i.id = p.idea_id
                    WHERE p.profile_id = pr.id AND p.program_id = me.program_id
                      AND p.status = 'submitted' AND p.idea_id <> @ideaId) c
      WHERE pr.active = 1 AND (pr.full_name LIKE @q OR pr.email LIKE @q)
      ORDER BY pr.full_name`,
    { ideaId, q: likeContains(term) }
  );
}
