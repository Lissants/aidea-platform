'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
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

function deriveStage(idea: any): DerivedStage {
  const showcase = idea.showcase_projects?.[0] ?? idea.showcase_projects;
  if (showcase?.published) return 'showcased';
  const qualifier = idea.qualifier_assessments?.[0] ?? idea.qualifier_assessments;
  if (qualifier?.published) return qualifier.build_decision === 'build' ? 'build' : 'no_build';
  const screening = idea.screening_decisions?.[0] ?? idea.screening_decisions;
  if (screening?.published) return screening.decision === 'pass_to_qualifier' ? 'screened_pass' : 'screened_fail';
  if (idea.status === 'submitted') return 'submitted';
  return 'draft';
}

/**
 * Admin browse/filter/sort/pagination over every submitted idea. Filtered
 * and paginated in memory after one fetch — acceptable at program scale
 * (hundreds, not millions, of ideas) and far simpler than expressing the
 * derived `stage` as SQL across five joined tables.
 */
export async function fetchIdeaList(programId: string, filters: IdeaListFilters): Promise<{ rows: IdeaListRow[]; total: number }> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('ideas')
    .select(
      `id, idea_title, team_name, status, created_at,
       idea_impacts (impact_kind, impact_type),
       review_assignments (mentor_profiles (profiles (full_name))),
       screening_decisions (decision, published),
       qualifier_assessments (build_decision, published),
       showcase_projects (published)`
    )
    .eq('program_id', programId);

  let rows: IdeaListRow[] = (data as any[] ?? []).map((idea) => {
    const primaryImpact = (idea.idea_impacts ?? []).find((i: any) => i.impact_kind === 'primary') ?? idea.idea_impacts?.[0];
    const reviewer = idea.review_assignments?.[0] ?? idea.review_assignments;
    return {
      id: idea.id,
      idea_title: idea.idea_title,
      team_name: idea.team_name,
      status: idea.status,
      impact_type: primaryImpact?.impact_type ?? null,
      reviewer_name: reviewer?.mentor_profiles?.profiles?.full_name ?? null,
      stage: deriveStage(idea),
      created_at: idea.created_at,
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
  team_members: { full_name: string }[];
  impacts: { impact_kind: string; impact_type: string; explanation: string | null; measurable_result: string | null }[];
  support_requests: { support_area: string; details: string | null; estimate: string | null }[];
  mentor_preferences: { priority: number; mentor_name: string }[];
  review: { id: string; status: string; reviewer_name: string | null } | null;
}

/** Full read-only submission detail — admin can view everything but has no
 * edit UI for participant-owned fields here; decisions happen on the
 * dedicated screening/qualifier/mentor/final-presentation pages. */
export async function fetchIdeaDetail(ideaId: string): Promise<IdeaFullDetail | null> {
  const supabase = await createClient();

  const { data: idea } = await supabase
    .from('ideas')
    .select(
      `id, idea_title, team_name, problem_opportunity, proposed_solution, target_users, status,
       idea_team_members (profiles (full_name)),
       idea_impacts (impact_kind, impact_type, explanation, measurable_result),
       idea_support_requests (support_area, details, estimate),
       idea_mentor_preferences (priority, mentor_profiles (profiles (full_name)))`
    )
    .eq('id', ideaId)
    .maybeSingle();

  if (!idea) return null;

  const { data: review } = await supabase
    .from('reviews')
    .select('id, status, profiles:reviewer_id (full_name)')
    .eq('idea_id', ideaId)
    .maybeSingle();

  const i = idea as any;
  return {
    id: i.id,
    idea_title: i.idea_title,
    team_name: i.team_name,
    problem_opportunity: i.problem_opportunity,
    proposed_solution: i.proposed_solution,
    target_users: i.target_users,
    status: i.status,
    team_members: (i.idea_team_members ?? []).map((m: any) => ({ full_name: m.profiles?.full_name ?? 'Unknown' })),
    impacts: i.idea_impacts ?? [],
    support_requests: i.idea_support_requests ?? [],
    mentor_preferences: (i.idea_mentor_preferences ?? []).map((p: any) => ({
      priority: p.priority,
      mentor_name: p.mentor_profiles?.profiles?.full_name ?? 'Unknown',
    })),
    review: review
      ? { id: (review as any).id, status: (review as any).status, reviewer_name: (review as any).profiles?.full_name ?? null }
      : null,
  };
}

/** Admin-initiated reopen — thin wrapper around fn_reopen_review, which is
 * itself audited and notifies the reviewer (0007_functions.sql). Don't
 * double-log here. */
export async function reopenReview(reviewId: string, ideaId: string, reason: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;
  if (!reason.trim()) return { error: 'A reason is required to reopen a review' } as const;

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_reopen_review', {
    p_review_id: reviewId,
    p_reason: reason,
    p_actor_id: user.id,
  });

  if (error) return { error: error.message } as const;
  revalidatePath(`/ideas/${ideaId}`);
  return { ok: true } as const;
}
