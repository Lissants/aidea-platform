'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db } from '@/lib/db';
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

const LOCKED_MESSAGE = 'This assessment has already been published and can no longer be edited.';

/** Ideas that passed screening — eligible for qualifier assessment. Admin-only. */
export async function fetchQualifierQueue(programId: string): Promise<QualifierQueueRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return [];

  return db.query<QualifierQueueRow>(
    `SELECT i.id AS idea_id, i.idea_title, i.team_name,
            qa.final_score, qa.overall_comment, qa.build_decision, qa.status,
            CAST(ISNULL(qa.published, 0) AS BIT) AS published
       FROM ideas i
       JOIN screening_decisions sd ON sd.idea_id = i.id AND sd.decision = 'pass_to_qualifier'
       LEFT JOIN qualifier_assessments qa ON qa.idea_id = i.id
      WHERE i.program_id = @programId`,
    { programId }
  );
}

async function assertEditable(ideaId: string) {
  const row = await db.queryOne<{ published: boolean }>(
    'SELECT published FROM qualifier_assessments WHERE idea_id = @ideaId',
    { ideaId }
  );
  if (row?.published) return LOCKED_MESSAGE;
  return null;
}

/** Upserts the assessment unless it is already published (re-checked inside the MERGE). */
async function upsertAssessment(
  ideaId: string,
  row: {
    final_score: number | null;
    overall_comment: string;
    build_decision: BuildDecision | null;
    status: QualifierStatus;
    finalize: boolean;
    decided_by: string;
  }
) {
  const { data: affected, error } = await attempt(() =>
    db.execute(
      `MERGE qualifier_assessments WITH (HOLDLOCK) AS t
       USING (SELECT @ideaId AS idea_id) AS s ON t.idea_id = s.idea_id
       WHEN MATCHED AND t.published = 0 THEN UPDATE SET
         final_score = @final_score, overall_comment = @overall_comment, build_decision = @build_decision,
         status = @status, decided_by = @decided_by,
         finalized_at = CASE WHEN @finalize = 1 THEN SYSDATETIMEOFFSET() ELSE t.finalized_at END
       WHEN NOT MATCHED THEN INSERT (idea_id, final_score, overall_comment, build_decision, status, decided_by, finalized_at)
         VALUES (@ideaId, @final_score, @overall_comment, @build_decision, @status, @decided_by,
                 CASE WHEN @finalize = 1 THEN SYSDATETIMEOFFSET() ELSE NULL END);`,
      { ideaId, ...row }
    )
  );
  if (error) return error;
  if (affected === 0) return LOCKED_MESSAGE;
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

  const error = await upsertAssessment(ideaId, {
    final_score: input.final_score,
    overall_comment: input.overall_comment,
    build_decision: input.build_decision,
    status: 'draft',
    finalize: false,
    decided_by: user.id,
  });

  if (error) return { error } as const;
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

  const error = await upsertAssessment(ideaId, {
    final_score: input.final_score,
    overall_comment: input.overall_comment,
    build_decision: input.build_decision,
    status: 'finalized',
    finalize: true,
    decided_by: user.id,
  });

  if (error) return { error } as const;
  revalidatePath('/qualifier');
  return { ok: true } as const;
}

export async function publishQualifierResults(programId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const { data, error } = await attempt(() =>
    db.callProc<{ published_count: number }>('usp_publish_batch', {
      program_id: programId,
      entity_type: 'qualifier_assessment',
      actor_id: user.id,
    })
  );

  if (error) return { error } as const;
  revalidatePath('/qualifier');
  revalidatePath('/dashboard');
  return { ok: true, count: data?.[0]?.published_count ?? 0 } as const;
}
