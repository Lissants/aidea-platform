'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import type { DerivedStage } from '@/lib/ideas/stage';

export interface IdeaListRow {
  id: string;
  idea_title: string;
  team_name: string;
  status: string;
  impact_type: string | null;
  reviewer_name: string | null;
  stage: DerivedStage;
  created_at: string;
  /** Submitted idea whose team leader slot is empty (leader left or was removed). */
  leader_vacant: boolean;
  /** Approved idea with someone on the team still on another approved idea (hasn't committed yet). */
  membership_conflict: boolean;
}

export interface IdeaListFilters {
  q?: string;
  impactType?: string;
  status?: string;
  stage?: string;
  reviewerId?: string;
  sort?: 'newest' | 'oldest' | 'title';
  page?: number;
  pageSize?: number;
}

interface StageSource {
  status: string;
  qualifier_published: boolean | null;
  build_decision: string | null;
  screening_published: boolean | null;
  screening_decision: string | null;
}

function deriveStage(idea: StageSource): DerivedStage {
  if (idea.qualifier_published) return idea.build_decision === 'build' ? 'build' : 'no_build';
  if (idea.screening_published) return idea.screening_decision === 'pass_to_qualifier' ? 'screened_pass' : 'screened_fail';
  if (idea.status === 'submitted') return 'submitted';
  return 'draft';
}

/**
 * Admin browse/filter/sort/pagination over every idea in the program.
 * Filtered and paginated in memory after one fetch — acceptable at program
 * scale (hundreds, not millions, of ideas) and far simpler than expressing
 * the derived `stage` as SQL across five joined tables. Admin-only (this is
 * a Server Action module, so it's callable directly — not just via the
 * admin-guarded page).
 */
export async function fetchIdeaList(programId: string, filters: IdeaListFilters): Promise<{ rows: IdeaListRow[]; total: number }> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { rows: [], total: 0 };

  // review_assignments / screening_decisions / qualifier_assessments are
  // each unique per idea, so plain LEFT JOINs are 1:1.
  const ideas = await db.query<
    StageSource & {
      id: string;
      idea_title: string;
      team_name: string;
      created_at: string;
      reviewer_name: string | null;
      team_leader_id: string | null;
      membership_conflict: boolean;
    }
  >(
    `SELECT i.id, i.idea_title, i.team_name, i.status, i.created_at, i.team_leader_id,
            CAST(CASE WHEN EXISTS (
              SELECT 1 FROM dbo.v_idea_participants p
               WHERE p.idea_id = i.id
                 AND EXISTS (SELECT 1 FROM dbo.v_approved_ideas a WHERE a.idea_id = i.id)
                 AND (SELECT COUNT(*) FROM dbo.v_idea_participants p2
                        JOIN dbo.v_approved_ideas a2 ON a2.idea_id = p2.idea_id
                       WHERE p2.profile_id = p.profile_id AND p2.program_id = i.program_id) > 1
            ) THEN 1 ELSE 0 END AS BIT) AS membership_conflict,
            p.full_name AS reviewer_name,
            sd.decision AS screening_decision, sd.published AS screening_published,
            qa.build_decision, qa.published AS qualifier_published
       FROM ideas i
       LEFT JOIN review_assignments ra ON ra.idea_id = i.id
       LEFT JOIN mentor_profiles mp ON mp.id = ra.mentor_profile_id
       LEFT JOIN profiles p ON p.id = mp.profile_id
       LEFT JOIN screening_decisions sd ON sd.idea_id = i.id
       LEFT JOIN qualifier_assessments qa ON qa.idea_id = i.id
      WHERE i.program_id = @programId`,
    { programId }
  );

  const impacts = await db.query<{ idea_id: string; impact_kind: string; impact_type: string }>(
    `SELECT ii.idea_id, ii.impact_kind, ii.impact_type
       FROM idea_impacts ii
       JOIN ideas i ON i.id = ii.idea_id
      WHERE i.program_id = @programId`,
    { programId }
  );
  const impactsByIdea = new Map<string, { impact_kind: string; impact_type: string }[]>();
  for (const imp of impacts) {
    const list = impactsByIdea.get(imp.idea_id) ?? [];
    list.push(imp);
    impactsByIdea.set(imp.idea_id, list);
  }

  let rows: IdeaListRow[] = ideas.map((idea) => {
    const ideaImpacts = impactsByIdea.get(idea.id) ?? [];
    const primaryImpact = ideaImpacts.find((i) => i.impact_kind === 'primary') ?? ideaImpacts[0];
    return {
      id: idea.id,
      idea_title: idea.idea_title,
      team_name: idea.team_name,
      status: idea.status,
      impact_type: primaryImpact?.impact_type ?? null,
      reviewer_name: idea.reviewer_name ?? null,
      stage: deriveStage(idea),
      created_at: idea.created_at,
      leader_vacant: idea.status === 'submitted' && !idea.team_leader_id,
      membership_conflict: !!idea.membership_conflict,
    };
  });

  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter((r) => r.idea_title.toLowerCase().includes(q) || r.team_name.toLowerCase().includes(q));
  }
  if (filters.impactType) rows = rows.filter((r) => r.impact_type === filters.impactType);
  if (filters.status) rows = rows.filter((r) => r.status === filters.status);
  if (filters.stage) rows = rows.filter((r) => r.stage === filters.stage);

  if (filters.sort === 'oldest') rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  else if (filters.sort === 'title') rows.sort((a, b) => a.idea_title.localeCompare(b.idea_title));
  else rows.sort((a, b) => b.created_at.localeCompare(a.created_at));

  const total = rows.length;
  const pageSize = filters.pageSize ?? 20;
  const page = Math.max(1, filters.page ?? 1);
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total };
}

export interface IdeaFullDetail {
  id: string;
  idea_title: string;
  team_name: string;
  problem_opportunity: string;
  proposed_solution: string;
  target_users: string | null;
  status: string;
  program_id: string;
  /** Screening Pass published: from here on each person may be on only this idea. */
  approved: boolean;
  /** null = leader slot vacant. */
  team_leader: { profile_id: string; full_name: string } | null;
  team_members: { profile_id: string; full_name: string }[];
  impacts: { impact_kind: string; impact_type: string; explanation: string | null; measurable_result: string | null }[];
  support_requests: { support_area: string; details: string | null; reason: string | null; estimate: string | null }[];
  mentor_preferences: { priority: number; mentor_name: string }[];
  review: { id: string; status: string; reviewer_name: string | null } | null;
  presentation: { url: string; name: string | null; uploaded_at: string | null } | null;
}

/** Full read-only submission detail — admin can view everything but has no
 * edit UI for participant-owned fields here; decisions happen on the
 * dedicated screening/qualifier/mentor/final-presentation pages.
 * Admin-only; returns null for anyone else. */
export async function fetchIdeaDetail(ideaId: string): Promise<IdeaFullDetail | null> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return null;

  const idea = await db.queryOne<{
    id: string;
    idea_title: string;
    team_name: string;
    problem_opportunity: string;
    proposed_solution: string;
    target_users: string | null;
    status: string;
    program_id: string;
    team_leader_id: string | null;
    team_leader_name: string | null;
    approved: boolean;
    presentation_url: string | null;
    presentation_name: string | null;
    presentation_uploaded_at: string | null;
  }>(
    `SELECT i.id, i.idea_title, i.team_name, i.problem_opportunity, i.proposed_solution, i.target_users, i.status,
            i.program_id, i.team_leader_id, lp.full_name AS team_leader_name,
            i.presentation_url, i.presentation_name, i.presentation_uploaded_at,
            CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.v_approved_ideas a WHERE a.idea_id = i.id) THEN 1 ELSE 0 END AS BIT) AS approved
       FROM ideas i LEFT JOIN profiles lp ON lp.id = i.team_leader_id
      WHERE i.id = @ideaId`,
    { ideaId }
  );
  if (!idea) return null;

  const [teamMembers, impacts, supportRequests, mentorPrefs, review] = await Promise.all([
    db.query<{ profile_id: string; full_name: string | null }>(
      `SELECT itm.profile_id, p.full_name FROM idea_team_members itm LEFT JOIN profiles p ON p.id = itm.profile_id
        WHERE itm.idea_id = @ideaId ORDER BY itm.member_order`,
      { ideaId }
    ),
    db.query<IdeaFullDetail['impacts'][number]>(
      'SELECT impact_kind, impact_type, explanation, measurable_result FROM idea_impacts WHERE idea_id = @ideaId',
      { ideaId }
    ),
    db.query<IdeaFullDetail['support_requests'][number]>(
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
    db.queryOne<{ id: string; status: string; reviewer_name: string | null }>(
      `SELECT TOP (1) r.id, r.status, p.full_name AS reviewer_name
         FROM reviews r LEFT JOIN profiles p ON p.id = r.reviewer_id
        WHERE r.idea_id = @ideaId
        ORDER BY r.created_at DESC`,
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
    program_id: idea.program_id,
    approved: !!idea.approved,
    team_leader: idea.team_leader_id
      ? { profile_id: idea.team_leader_id, full_name: idea.team_leader_name ?? 'Unknown' }
      : null,
    team_members: teamMembers.map((m) => ({ profile_id: m.profile_id, full_name: m.full_name ?? 'Unknown' })),
    impacts,
    support_requests: supportRequests,
    mentor_preferences: mentorPrefs.map((p) => ({ priority: p.priority, mentor_name: p.full_name ?? 'Unknown' })),
    review: review ? { id: review.id, status: review.status, reviewer_name: review.reviewer_name ?? null } : null,
    presentation: idea.presentation_url
      ? { url: idea.presentation_url, name: idea.presentation_name, uploaded_at: idea.presentation_uploaded_at }
      : null,
  };
}

/** Admin-initiated reopen — thin wrapper around usp_reopen_review, which is
 * itself admin-checked, audited and notifies the reviewer
 * (db/migrations/0003_procedures.sql). Don't double-log here. */
export async function reopenReview(reviewId: string, ideaId: string, reason: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;
  if (!reason.trim()) return { error: 'A reason is required to reopen a review' } as const;

  const { error } = await attempt(() =>
    db.callProc('usp_reopen_review', { review_id: reviewId, reason, actor_id: user.id })
  );

  if (error) return { error } as const;
  revalidatePath(`/ideas/${ideaId}`);
  return { ok: true } as const;
}
