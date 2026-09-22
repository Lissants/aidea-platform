'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import type { BuildDecision, QualifierStatus } from '@/types/database';

export interface QualifierQueueRow {
  idea_id: string;
  idea_title: string;
  team_name: string;
  final_score: number | null;
  overall_comment: string | null;
  build_decision: BuildDecision | null;
  status: QualifierStatus | null;
  published: boolean;
}

/** Ideas that passed screening — eligible for qualifier assessment. */
export async function fetchQualifierQueue(programId: string): Promise<QualifierQueueRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('ideas')
    .select(
      `id, idea_title, team_name,
       screening_decisions!inner (decision),
       qualifier_assessments (final_score, overall_comment, build_decision, status, published)`
    )
    .eq('program_id', programId)
    .eq('screening_decisions.decision', 'pass_to_qualifier');

  if (error || !data) return [];

  return (data as any[]).map((idea) => {
    const qa = idea.qualifier_assessments?.[0] ?? idea.qualifier_assessments ?? null;
    return {
      idea_id: idea.id,
      idea_title: idea.idea_title,
      team_name: idea.team_name,
      final_score: qa?.final_score ?? null,
      overall_comment: qa?.overall_comment ?? null,
      build_decision: qa?.build_decision ?? null,
      status: qa?.status ?? null,
      published: qa?.published ?? false,
    };
  });
}

async function assertEditable(ideaId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('qualifier_assessments').select('published').eq('idea_id', ideaId).maybeSingle();
  if (data?.published) return 'This assessment has already been published and can no longer be edited.';
  return null;
}

export async function saveQualifierDraft(
  ideaId: string,
  input: { final_score: number | null; overall_comment: string; build_decision: BuildDecision | null }
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const lockError = await assertEditable(ideaId);
  if (lockError) return { error: lockError } as const;

  const supabase = await createClient();
  const { error } = await supabase.from('qualifier_assessments').upsert(
    {
      idea_id: ideaId,
      final_score: input.final_score,
      overall_comment: input.overall_comment,
      build_decision: input.build_decision,
      status: 'draft',
      decided_by: user.id,
    },
    { onConflict: 'idea_id' }
  );

  if (error) return { error: error.message } as const;
  revalidatePath('/qualifier');
  return { ok: true } as const;
}

export async function finalizeQualifier(
  ideaId: string,
  input: { final_score: number; overall_comment: string; build_decision: BuildDecision }
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  if (input.final_score === null || Number.isNaN(input.final_score)) {
    return { error: 'A final score is required to finalize' } as const;
  }
  if (!input.overall_comment || input.overall_comment.trim().length < 10) {
    return { error: 'An overall comment is required to finalize' } as const;
  }
  if (!input.build_decision) {
    return { error: 'A build / no build decision is required to finalize' } as const;
  }

  const lockError = await assertEditable(ideaId);
  if (lockError) return { error: lockError } as const;

  const supabase = await createClient();
  const { error } = await supabase.from('qualifier_assessments').upsert(
    {
      idea_id: ideaId,
      final_score: input.final_score,
      overall_comment: input.overall_comment,
      build_decision: input.build_decision,
      status: 'finalized',
      finalized_at: new Date().toISOString(),
      decided_by: user.id,
    },
    { onConflict: 'idea_id' }
  );

  if (error) return { error: error.message } as const;
  revalidatePath('/qualifier');
  return { ok: true } as const;
}

export async function publishQualifierResults(programId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_publish_batch', {
    p_program_id: programId,
    p_entity_type: 'qualifier_assessment',
    p_actor_id: user.id,
  });

  if (error) return { error: error.message } as const;
  revalidatePath('/qualifier');
  revalidatePath('/dashboard');
  return { ok: true, count: data } as const;
}
