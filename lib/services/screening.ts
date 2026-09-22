'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import { logAudit } from '@/lib/audit/log';
import { screeningDecisionSchema } from '@/lib/validation/schemas';
import type { ReviewRecommendation, ScreeningDecisionValue } from '@/types/database';

export interface ScreeningQueueRow {
  idea_id: string;
  idea_title: string;
  team_name: string;
  problem_opportunity: string;
  proposed_solution: string;
  mentor_recommendation: ReviewRecommendation | null;
  mentor_comment: string | null;
  mentor_name: string | null;
  decision: ScreeningDecisionValue | null;
  internal_reason: string | null;
  published: boolean;
}

/** Ideas with a completed mentor review, ready for a screening decision. */
export async function fetchScreeningQueue(programId: string): Promise<ScreeningQueueRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('ideas')
    .select(
      `id, idea_title, team_name, problem_opportunity, proposed_solution,
       reviews (recommendation, comment, reviewer_id, status, profiles:reviewer_id (full_name)),
       screening_decisions (decision, internal_reason, published)`
    )
    .eq('program_id', programId)
    .eq('status', 'submitted');

  if (error || !data) return [];

  return (data as any[])
    .map((idea) => {
      const reviews = Array.isArray(idea.reviews) ? idea.reviews : idea.reviews ? [idea.reviews] : [];
      const submittedReview = reviews.find((r: any) => r.status === 'submitted') ?? null;
      const screening = idea.screening_decisions?.[0] ?? idea.screening_decisions ?? null;

      return {
        idea_id: idea.id,
        idea_title: idea.idea_title,
        team_name: idea.team_name,
        problem_opportunity: idea.problem_opportunity,
        proposed_solution: idea.proposed_solution,
        mentor_recommendation: submittedReview?.recommendation ?? null,
        mentor_comment: submittedReview?.comment ?? null,
        mentor_name: submittedReview?.profiles?.full_name ?? null,
        decision: screening?.decision ?? null,
        internal_reason: screening?.internal_reason ?? null,
        published: screening?.published ?? false,
        _hasSubmittedReview: !!submittedReview,
      };
    })
    .filter((row: any) => row._hasSubmittedReview)
    .map(({ _hasSubmittedReview, ...rest }: any) => rest);
}

export async function saveScreeningDecision(
  ideaId: string,
  input: { decision: ScreeningDecisionValue; internal_reason?: string | null },
  mentorRecommendation: ReviewRecommendation | null
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const parsed = screeningDecisionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const;

  const differs =
    (mentorRecommendation === 'recommend_pass' && parsed.data.decision === 'not_pass') ||
    (mentorRecommendation === 'recommend_not_pass' && parsed.data.decision === 'pass_to_qualifier');

  if (differs && (!parsed.data.internal_reason || parsed.data.internal_reason.trim().length < 5)) {
    return { error: 'A reason is required when your decision differs from the mentor recommendation' } as const;
  }

  const supabase = await createClient();

  const { data: existing } = await supabase.from('screening_decisions').select('id, published, decision').eq('idea_id', ideaId).maybeSingle();
  if (existing?.published) {
    return { error: 'This decision has already been published and can no longer be edited' } as const;
  }

  const { data: program } = await supabase.from('ideas').select('program_id').eq('id', ideaId).single();

  const { error } = await supabase.from('screening_decisions').upsert(
    {
      idea_id: ideaId,
      decision: parsed.data.decision,
      differs_from_recommendation: differs,
      internal_reason: parsed.data.internal_reason ?? null,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    },
    { onConflict: 'idea_id' }
  );

  if (error) return { error: error.message } as const;

  if (differs) {
    await logAudit({
      programId: program?.program_id,
      entityType: 'screening_decision',
      entityId: ideaId,
      actorId: user.id,
      action: 'screening_decision_differs_from_recommendation',
      priorValue: { mentor_recommendation: mentorRecommendation, prior_decision: existing?.decision ?? null },
      newValue: { decision: parsed.data.decision },
      reason: parsed.data.internal_reason,
    });
  }

  revalidatePath('/screening');
  return { ok: true } as const;
}

export async function publishScreeningDecisions(programId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_publish_batch', {
    p_program_id: programId,
    p_entity_type: 'screening_decision',
    p_actor_id: user.id,
  });

  if (error) return { error: error.message } as const;

  revalidatePath('/screening');
  revalidatePath('/dashboard');
  return { ok: true, count: data } as const;
}
