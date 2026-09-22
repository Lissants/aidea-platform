'use server';

import { createClient } from '@/lib/supabase/server';

export interface FunnelStage {
  stage: string;
  count: number;
}

export interface WorkloadRow {
  name: string;
  active: number;
  capacity: number;
}

export interface TurnoutPoint {
  idea_title: string;
  vote_count: number;
}

export interface WinnerCategoryRow {
  category: string;
  count: number;
}

/**
 * Submission funnel — each stage counts ideas that have reached at least
 * that far. Not mutually exclusive buckets on purpose: a funnel chart reads
 * as "how many made it this far", which needs the >= semantics below.
 */
export async function fetchSubmissionFunnel(programId: string): Promise<FunnelStage[]> {
  const supabase = createClient();

  const { count: draftCount } = await supabase
    .from('ideas')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', programId);

  const { count: submittedCount } = await supabase
    .from('ideas')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', programId)
    .eq('status', 'submitted');

  const { count: screenedCount } = await supabase
    .from('screening_decisions')
    .select('id, ideas!inner(program_id)', { count: 'exact', head: true })
    .eq('ideas.program_id', programId)
    .eq('published', true);

  const { count: qualifiedCount } = await supabase
    .from('qualifier_assessments')
    .select('id, ideas!inner(program_id)', { count: 'exact', head: true })
    .eq('ideas.program_id', programId)
    .eq('published', true)
    .eq('build_decision', 'build');

  const { count: showcasedCount } = await supabase
    .from('showcase_projects')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', programId)
    .eq('published', true);

  return [
    { stage: 'Draft/Total', count: draftCount ?? 0 },
    { stage: 'Submitted', count: submittedCount ?? 0 },
    { stage: 'Screened', count: screenedCount ?? 0 },
    { stage: 'Qualified (Build)', count: qualifiedCount ?? 0 },
    { stage: 'Showcased', count: showcasedCount ?? 0 },
  ];
}

export async function fetchReviewerWorkload(programId: string): Promise<WorkloadRow[]> {
  const supabase = createClient();
  const { data: mentors } = await supabase.from('mentor_profiles').select('id, max_capacity, profiles(full_name)');
  if (!mentors) return [];

  const { data: activeAssignments } = await supabase
    .from('review_assignments')
    .select('mentor_profile_id, ideas!inner(program_id)')
    .eq('status', 'pending')
    .eq('ideas.program_id', programId);

  const counts = new Map<string, number>();
  for (const a of (activeAssignments as any[]) ?? []) {
    if (!a.mentor_profile_id) continue;
    counts.set(a.mentor_profile_id, (counts.get(a.mentor_profile_id) ?? 0) + 1);
  }

  return (mentors as any[]).map((m) => ({
    name: m.profiles?.full_name ?? 'Mentor',
    active: counts.get(m.id) ?? 0,
    capacity: m.max_capacity,
  }));
}

/** Latest voting period's per-idea turnout — admin-only via fn_vote_tallies'
 * is_admin bypass (0010_fn_vote_tallies_admin_bypass.sql). */
export async function fetchVotingTurnout(programId: string): Promise<TurnoutPoint[]> {
  const supabase = createClient();
  const { data: period } = await supabase
    .from('voting_periods')
    .select('id')
    .eq('program_id', programId)
    .order('opens_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!period) return [];

  const { data } = await supabase.rpc('fn_vote_tallies', { p_voting_period_id: period.id });
  return (data ?? []).map((t: any) => ({ idea_title: t.idea_title, vote_count: Number(t.vote_count) }));
}

export async function fetchWinnerCategories(programId: string): Promise<WinnerCategoryRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('final_presentation_assessments')
    .select('winner_decision, winner_category')
    .eq('program_id', programId)
    .eq('published', true);

  const counts = { grand_winner: 0, runner_up: 0, no_winner: 0 };
  for (const r of data ?? []) {
    if (r.winner_category === 'grand_winner') counts.grand_winner += 1;
    else if (r.winner_category === 'runner_up') counts.runner_up += 1;
    else if (r.winner_decision === 'no_winner') counts.no_winner += 1;
  }

  return [
    { category: 'Grand Winner', count: counts.grand_winner },
    { category: 'Runner-Up', count: counts.runner_up },
    { category: 'No Winner', count: counts.no_winner },
  ];
}
