'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db, DbError } from '@/lib/db';
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

const LOCKED_MESSAGE = 'This assessment has already been published and can no longer be edited.';

/** Build-decision ideas — the pool eligible for final presentation. Admin-only. */
export async function fetchFinalPresentationQueue(programId: string): Promise<FinalPresentationQueueRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return [];

  return db.query<FinalPresentationQueueRow>(
    `SELECT i.id AS idea_id, i.idea_title, i.team_name,
            fpa.final_score, fpa.overall_comment, fpa.winner_decision, fpa.winner_category, fpa.status,
            CAST(ISNULL(fpa.published, 0) AS BIT) AS published
       FROM ideas i
       JOIN qualifier_assessments qa ON qa.idea_id = i.id AND qa.status = 'finalized' AND qa.build_decision = 'build'
       LEFT JOIN final_presentation_assessments fpa ON fpa.idea_id = i.id
      WHERE i.program_id = @programId`,
    { programId }
  );
}

/** Which winner_category values are already taken program-wide, and by
 * which idea — used to disable the taken option everywhere else in the UI. Admin-only. */
export async function fetchTakenCategories(programId: string): Promise<Record<WinnerCategory, string | null>> {
  const taken: Record<WinnerCategory, string | null> = { grand_winner: null, runner_up: null };
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return taken;

  const rows = await db.query<{ idea_id: string; winner_category: WinnerCategory | null }>(
    `SELECT idea_id, winner_category FROM final_presentation_assessments
      WHERE program_id = @programId AND winner_category IS NOT NULL`,
    { programId }
  );

  for (const row of rows) {
    const cat = row.winner_category;
    if (cat === 'grand_winner' || cat === 'runner_up') {
      taken[cat] = row.idea_id;
    }
  }
  return taken;
}

async function assertEditable(ideaId: string) {
  const row = await db.queryOne<{ published: boolean }>(
    'SELECT published FROM final_presentation_assessments WHERE idea_id = @ideaId',
    { ideaId }
  );
  if (row?.published) return LOCKED_MESSAGE;
  return null;
}

type UpsertResult = { ok: true } | { ok: false; error: string; uniqueViolation: boolean };

/**
 * Upserts the assessment unless it is already published (re-checked inside
 * the MERGE). program_id is filled by trg_final_presentation_program_id, and
 * the filtered unique indexes uq_one_grand_winner_per_program /
 * uq_one_runner_up_per_program reject a second winner of a category.
 */
async function upsertAssessment(
  ideaId: string,
  row: {
    final_score: number | null;
    overall_comment: string;
    winner_decision: WinnerDecision | null;
    winner_category: WinnerCategory | null;
    status: FinalPresentationStatus;
    finalize: boolean;
    decided_by: string;
  }
): Promise<UpsertResult> {
  try {
    const affected = await db.execute(
      `MERGE final_presentation_assessments WITH (HOLDLOCK) AS t
       USING (SELECT @ideaId AS idea_id) AS s ON t.idea_id = s.idea_id
       WHEN MATCHED AND t.published = 0 THEN UPDATE SET
         final_score = @final_score, overall_comment = @overall_comment,
         winner_decision = @winner_decision, winner_category = @winner_category,
         status = @status, decided_by = @decided_by,
         finalized_at = CASE WHEN @finalize = 1 THEN SYSDATETIMEOFFSET() ELSE t.finalized_at END
       WHEN NOT MATCHED THEN INSERT
         (idea_id, final_score, overall_comment, winner_decision, winner_category, status, decided_by, finalized_at)
         VALUES (@ideaId, @final_score, @overall_comment, @winner_decision, @winner_category, @status, @decided_by,
                 CASE WHEN @finalize = 1 THEN SYSDATETIMEOFFSET() ELSE NULL END);`,
      { ideaId, ...row }
    );
    if (affected === 0) return { ok: false, error: LOCKED_MESSAGE, uniqueViolation: false };
    return { ok: true };
  } catch (err) {
    if (err instanceof DbError) return { ok: false, error: err.message, uniqueViolation: err.isUniqueViolation };
    return { ok: false, error: err instanceof Error ? err.message : 'Database error', uniqueViolation: false };
  }
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

  const result = await upsertAssessment(ideaId, {
    final_score: input.final_score,
    overall_comment: input.overall_comment,
    winner_decision: input.winner_decision,
    winner_category: input.winner_category,
    status: 'draft',
    finalize: false,
    decided_by: user.id,
  });

  if (!result.ok) {
    if (result.uniqueViolation) {
      return { error: 'That winner category was just taken by another idea. Please choose a different category.' } as const;
    }
    return { error: result.error } as const;
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

  const result = await upsertAssessment(ideaId, {
    final_score: input.final_score,
    overall_comment: input.overall_comment,
    winner_decision: input.winner_decision,
    winner_category: input.winner_decision === 'winner' ? input.winner_category : null,
    status: 'finalized',
    finalize: true,
    decided_by: user.id,
  });

  if (!result.ok) {
    if (result.uniqueViolation) {
      return {
        error: 'That winner category was just taken by another idea (someone else finalized first). Please pick a different category.',
      } as const;
    }
    return { error: result.error } as const;
  }

  revalidatePath('/final-presentation');
  return { ok: true } as const;
}

export async function publishFinalPresentationResults(programId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const { data, error } = await attempt(() =>
    db.callProc<{ published_count: number }>('usp_publish_batch', {
      program_id: programId,
      entity_type: 'final_presentation_assessment',
      actor_id: user.id,
    })
  );

  if (error) return { error } as const;
  revalidatePath('/final-presentation');
  revalidatePath('/results');
  return { ok: true, count: data?.[0]?.published_count ?? 0 } as const;
}
