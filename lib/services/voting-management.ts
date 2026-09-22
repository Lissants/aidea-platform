'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import { logAudit } from '@/lib/audit/log';
import { votingPeriodSchema } from '@/lib/validation/schemas';

export interface VotingPeriodRow {
  id: string;
  program_id: string;
  opens_at: string;
  closes_at: string;
  show_percentages: boolean;
  results_published: boolean;
  results_published_at: string | null;
}

export interface TurnoutRow {
  idea_id: string;
  idea_title: string;
  team_name: string;
  vote_count: number;
}

export async function fetchVotingPeriods(programId: string): Promise<VotingPeriodRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('voting_periods')
    .select('*')
    .eq('program_id', programId)
    .order('opens_at', { ascending: false });
  return (data ?? []) as VotingPeriodRow[];
}

/**
 * Live per-idea vote counts. Only reachable for an admin session — everyone
 * else is blocked by fn_vote_tallies' own guard (results_published or
 * is_admin(), see 0010_fn_vote_tallies_admin_bypass.sql) even if they somehow
 * called this. Voters must never see live counts, only the published
 * Results page.
 */
export async function fetchLiveTurnout(votingPeriodId: string): Promise<TurnoutRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return [];

  const supabase = await createClient();
  const { data } = await supabase.rpc('fn_vote_tallies', { p_voting_period_id: votingPeriodId });
  return (data ?? []).map((t: any) => ({
    idea_id: t.idea_id,
    idea_title: t.idea_title,
    team_name: t.team_name,
    vote_count: Number(t.vote_count),
  }));
}

/** Create or update a voting period. Saving is never publishing — it only
 * schedules/reschedules the window and the percentage-display toggle. */
export async function saveVotingPeriod(
  programId: string,
  input: { id?: string; opens_at: string; closes_at: string; show_percentages: boolean }
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const parsed = votingPeriodSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const;

  const supabase = await createClient();

  if (input.id) {
    const { data: existing } = await supabase.from('voting_periods').select('results_published').eq('id', input.id).maybeSingle();
    if (existing?.results_published) {
      return { error: 'This voting period is already published and can no longer be edited.' } as const;
    }
    const { error } = await supabase
      .from('voting_periods')
      .update({ opens_at: parsed.data.opens_at, closes_at: parsed.data.closes_at, show_percentages: parsed.data.show_percentages })
      .eq('id', input.id);
    if (error) return { error: error.message } as const;
  } else {
    const { error } = await supabase.from('voting_periods').insert({
      program_id: programId,
      opens_at: parsed.data.opens_at,
      closes_at: parsed.data.closes_at,
      show_percentages: parsed.data.show_percentages,
    });
    if (error) return { error: error.message } as const;
  }

  revalidatePath('/voting-management');
  revalidatePath('/voting');
  return { ok: true } as const;
}

/**
 * Publish Favorite Project — the distinct publish step that makes the
 * participant-facing Results page show anything at all (it gates strictly
 * on results_published). Unlike the idea-keyed decision screens this isn't
 * a per-idea batch, so it's handled directly here rather than through
 * fn_publish_batch: sets results_published/_at, writes a publications
 * ledger row, audits it, and notifies every voter who cast a ballot.
 */
export async function publishVotingResults(votingPeriodId: string, programId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const supabase = await createClient();

  const { data: period } = await supabase.from('voting_periods').select('*').eq('id', votingPeriodId).maybeSingle();
  if (!period) return { error: 'Voting period not found' } as const;
  if (period.results_published) return { error: 'Results are already published' } as const;
  if (new Date(period.closes_at) > new Date()) {
    return { error: 'Voting has not closed yet — results cannot be published while voting is still open.' } as const;
  }

  const publishedAt = new Date().toISOString();
  const { error } = await supabase
    .from('voting_periods')
    .update({ results_published: true, results_published_at: publishedAt })
    .eq('id', votingPeriodId);
  if (error) return { error: error.message } as const;

  await supabase.from('publications').insert({
    program_id: programId,
    entity_type: 'voting_period',
    entity_id: votingPeriodId,
    published_by: user.id,
    notes: 'Favorite Project voting results published',
  });

  await logAudit({
    programId,
    entityType: 'voting_period',
    entityId: votingPeriodId,
    actorId: user.id,
    action: 'publish_voting_results',
    priorValue: { results_published: false },
    newValue: { results_published: true, results_published_at: publishedAt },
  });

  const { data: voters } = await supabase.from('votes').select('voter_id').eq('voting_period_id', votingPeriodId);
  const voterIds = Array.from(new Set((voters ?? []).map((v) => v.voter_id)));
  if (voterIds.length > 0) {
    await supabase.from('notifications').insert(
      voterIds.map((uid) => ({
        user_id: uid,
        type: 'voting_result_published',
        title: 'Favorite Project results are published',
        body: 'The Favorite Project voting results are now live.',
        link: '/results',
      }))
    );
  }

  revalidatePath('/voting-management');
  revalidatePath('/results');
  return { ok: true, count: voterIds.length } as const;
}
