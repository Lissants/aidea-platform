'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db } from '@/lib/db';
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

/** Ideas with a completed mentor review, ready for a screening decision. Admin-only (includes internal_reason). */
export async function fetchScreeningQueue(programId: string): Promise<ScreeningQueueRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return [];

  // CROSS APPLY keeps only ideas that have a submitted review (latest one wins).
  return db.query<ScreeningQueueRow>(
    `SELECT i.id AS idea_id, i.idea_title, i.team_name, i.problem_opportunity, i.proposed_solution,
            r.recommendation AS mentor_recommendation, r.comment AS mentor_comment, rp.full_name AS mentor_name,
            sd.decision, sd.internal_reason, CAST(ISNULL(sd.published, 0) AS BIT) AS published
       FROM ideas i
      CROSS APPLY (SELECT TOP (1) rv.recommendation, rv.comment, rv.reviewer_id
                     FROM reviews rv
                    WHERE rv.idea_id = i.id AND rv.status = 'submitted'
                    ORDER BY rv.submitted_at DESC) r
       LEFT JOIN profiles rp ON rp.id = r.reviewer_id
       LEFT JOIN screening_decisions sd ON sd.idea_id = i.id
      WHERE i.program_id = @programId
        AND i.status = 'submitted'`,
    { programId }
  );
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

  const existing = await db.queryOne<{ id: string; published: boolean; decision: ScreeningDecisionValue }>(
    'SELECT id, published, decision FROM screening_decisions WHERE idea_id = @ideaId',
    { ideaId }
  );
  if (existing?.published) {
    return { error: 'This decision has already been published and can no longer be edited' } as const;
  }

  const program = await db.queryOne<{ program_id: string }>('SELECT program_id FROM ideas WHERE id = @ideaId', { ideaId });
  if (!program) return { error: 'Idea not found' } as const;

  // published = 0 in the match condition so a concurrent publish can't be overwritten.
  const { data: affected, error } = await attempt(() =>
    db.execute(
      `MERGE screening_decisions WITH (HOLDLOCK) AS t
       USING (SELECT @ideaId AS idea_id) AS s ON t.idea_id = s.idea_id
       WHEN MATCHED AND t.published = 0 THEN UPDATE SET
         decision = @decision, differs_from_recommendation = @differs, internal_reason = @internal_reason,
         decided_by = @uid, decided_at = SYSDATETIMEOFFSET()
       WHEN NOT MATCHED THEN INSERT (idea_id, decision, differs_from_recommendation, internal_reason, decided_by, decided_at)
         VALUES (@ideaId, @decision, @differs, @internal_reason, @uid, SYSDATETIMEOFFSET());`,
      {
        ideaId,
        decision: parsed.data.decision,
        differs,
        internal_reason: parsed.data.internal_reason ?? null,
        uid: user.id,
      }
    )
  );

  if (error) return { error } as const;
  if (affected === 0) {
    return { error: 'This decision has already been published and can no longer be edited' } as const;
  }

  if (differs) {
    await logAudit({
      programId: program.program_id,
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

  const { data, error } = await attempt(() =>
    db.callProc<{ published_count: number }>('usp_publish_batch', {
      program_id: programId,
      entity_type: 'screening_decision',
      actor_id: user.id,
    })
  );

  if (error) return { error } as const;

  revalidatePath('/screening');
  revalidatePath('/dashboard');
  revalidatePath('/my-ideas');
  return { ok: true, count: data?.[0]?.published_count ?? 0 } as const;
}
