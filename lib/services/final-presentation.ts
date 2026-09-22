'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import type { WinnerCategory, WinnerDecision, FinalPresentationStatus } from '@/types/database';

export interface FinalPresentationQueueRow {
  idea_id: string;
  idea_title: string;
  team_name: string;
  final_score: number | null;
  overall_comment: string | null;
  winner_decision: WinnerDecision | null;
  winner_category: WinnerCategory | null;
  status: FinalPresentationStatus | null;
  published: boolean;
}

/** Build-decision ideas — the pool eligible for final presentation. */
export async function fetchFinalPresentationQueue(programId: string): Promise<FinalPresentationQueueRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('ideas')
    .select(
      `id, idea_title, team_name,
       qualifier_assessments!inner (build_decision, status),
       final_presentation_assessments (final_score, overall_comment, winner_decision, winner_category, status, published)`
    )
    .eq('program_id', programId)
    .eq('qualifier_assessments.status', 'finalized')
    .eq('qualifier_assessments.build_decision', 'build');

  if (error || !data) return [];

  return (data as any[]).map((idea) => {
    const fpa = idea.final_presentation_assessments?.[0] ?? idea.final_presentation_assessments ?? null;
    return {
      idea_id: idea.id,
      idea_title: idea.idea_title,
      team_name: idea.team_name,
      final_score: fpa?.final_score ?? null,
      overall_comment: fpa?.overall_comment ?? null,
      winner_decision: fpa?.winner_decision ?? null,
      winner_category: fpa?.winner_category ?? null,
      status: fpa?.status ?? null,
      published: fpa?.published ?? false,
    };
  });
}

/** Which winner_category values are already taken program-wide, and by
 * which idea — used to disable the taken option everywhere else in the UI. */
export async function fetchTakenCategories(programId: string): Promise<Record<WinnerCategory, string | null>> {
  const supabase = createClient();
  const { data } = await supabase
    .from('final_presentation_assessments')
    .select('idea_id, winner_category')
    .eq('program_id', programId)
    .not('winner_category', 'is', null);

  const taken: Record<WinnerCategory, string | null> = { grand_winner: null, runner_up: null };
  for (const row of data ?? []) {
    const cat = row.winner_category as WinnerCategory | null;
    if (cat === 'grand_winner' || cat === 'runner_up') {
      taken[cat] = row.idea_id;
    }
  }
  return taken;
}

async function assertEditable(ideaId: string) {
  const supabase = createClient();
  const { data } = await supabase.from('final_presentation_assessments').select('published').eq('idea_id', ideaId).maybeSingle();
  if (data?.published) return 'This assessment has already been published and can no longer be edited.';
  return null;
}

function isUniqueViolation(error: { code?: string } | null) {
  return error?.code === '23505';
}

export async function saveFinalPresentationDraft(
  ideaId: string,
  input: {
    final_score: number | null;
    overall_comment: string;
    winner_decision: WinnerDecision | null;
    winner_category: WinnerCategory | null;
  }
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const lockError = await assertEditable(ideaId);
  if (lockError) return { error: lockError } as const;

  const supabase = createClient();
  const { error } = await supabase.from('final_presentation_assessments').upsert(
    {
      idea_id: ideaId,
      final_score: input.final_score,
      overall_comment: input.overall_comment,
      winner_decision: input.winner_decision,
      winner_category: input.winner_category,
      status: 'draft',
      decided_by: user.id,
    },
    { onConflict: 'idea_id' }
  );

  if (error) {
    if (isUniqueViolation(error)) {
      return { error: 'That winner category was just taken by another idea. Please choose a different category.' } as const;
    }
    return { error: error.message } as const;
  }

  revalidatePath('/final-presentation');
  return { ok: true } as const;
}

export async function finalizeFinalPresentation(
  ideaId: string,
  input: {
    final_score: number;
    overall_comment: string;
    winner_decision: WinnerDecision;
    winner_category: WinnerCategory | null;
  }
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  if (input.final_score === null || Number.isNaN(input.final_score)) {
    return { error: 'A final score is required to finalize' } as const;
  }
  if (!input.overall_comment || input.overall_comment.trim().length < 10) {
    return { error: 'An overall comment is required to finalize' } as const;
  }
  if (input.winner_decision === 'winner' && !input.winner_category) {
    return { error: 'A winner category is required when marking a winner' } as const;
  }

  const lockError = await assertEditable(ideaId);
  if (lockError) return { error: lockError } as const;

  const supabase = createClient();
  const { error } = await supabase.from('final_presentation_assessments').upsert(
    {
      idea_id: ideaId,
      final_score: input.final_score,
      overall_comment: input.overall_comment,
      winner_decision: input.winner_decision,
      winner_category: input.winner_decision === 'winner' ? input.winner_category : null,
      status: 'finalized',
      finalized_at: new Date().toISOString(),
      decided_by: user.id,
    },
    { onConflict: 'idea_id' }
  );

  if (error) {
    if (isUniqueViolation(error)) {
      return {
        error: 'That winner category was just taken by another idea (someone else finalized first). Please pick a different category.',
      } as const;
    }
    return { error: error.message } as const;
  }

  revalidatePath('/final-presentation');
  return { ok: true } as const;
}

export async function publishFinalPresentationResults(programId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const supabase = createClient();
  const { data, error } = await supabase.rpc('fn_publish_batch', {
    p_program_id: programId,
    p_entity_type: 'final_presentation_assessment',
    p_actor_id: user.id,
  });

  if (error) return { error: error.message } as const;
  revalidatePath('/final-presentation');
  revalidatePath('/results');
  return { ok: true, count: data } as const;
}
