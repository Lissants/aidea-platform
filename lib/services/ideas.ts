'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db, DbError, newId } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import {
  ideaDraftSaveSchema,
  ideaDraftSchema,
  type IdeaDraftInput,
  type IdeaDraftSaveInput,
} from '@/lib/validation/schemas';

type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Creates or updates the participant's idea draft (basics + team + impacts +
 * support requests + mentor preferences) in a single DB transaction.
 * Mirrors the old participants_crud_own_drafts rule (0099_rls.sql): an
 * existing draft is only editable by its creator while status='draft', and
 * that is verified (with an update lock) before any child rows are replaced,
 * so nothing is written for someone else's or an already-submitted idea.
 *
 * Validation is lenient (ideaDraftSaveSchema): a draft can be saved with
 * sections still empty. Completeness is only checked on submit.
 */
export async function saveIdeaDraft(programId: string, ideaId: string | null, input: IdeaDraftSaveInput) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' } as const;

  const parsed = ideaDraftSaveSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const;
  }

  const result = await writeDraft(user, programId, ideaId, parsed.data);
  if (result.error) return { error: result.error } as const;

  revalidatePath('/my-ideas');
  return { ok: true, ideaId: result.data } as const;
}

/**
 * Final submit from the wizard: validates every section against the full
 * ideaDraftSchema, saves the latest values, then runs usp_submit_idea.
 */
export async function submitIdeaDraft(programId: string, ideaId: string | null, input: IdeaDraftInput) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' } as const;

  const parsed = ideaDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const;
  }

  const saved = await writeDraft(user, programId, ideaId, parsed.data);
  if (saved.data === null) return { error: saved.error } as const;

  const submitted = await submitIdea(saved.data);
  if ('error' in submitted) return { error: submitted.error, ideaId: saved.data } as const;
  return { ok: true, ideaId: saved.data } as const;
}

async function writeDraft(user: SessionUser, programId: string, ideaId: string | null, data: IdeaDraftSaveInput) {
  const basics = {
    program_id: programId,
    team_name: data.team_name ?? '',
    // Column is NOT NULL, so a draft saved before a leader is picked falls back to the creator.
    team_leader_id: data.team_leader_id ?? user.id,
    idea_title: data.idea_title ?? '',
    problem_opportunity: data.problem_opportunity ?? '',
    proposed_solution: data.proposed_solution ?? '',
    target_users: data.target_users || null,
  };

  return attempt(() =>
    db.transaction(async (tx) => {
      let currentIdeaId: string;

      if (ideaId) {
        const owned = await tx.queryOne(
          `SELECT id FROM ideas WITH (UPDLOCK, ROWLOCK)
            WHERE id = @ideaId AND created_by = @uid AND status = 'draft'`,
          { ideaId, uid: user.id }
        );
        if (!owned) throw new DbError('Idea not found or no longer editable');
        await tx.update('ideas', basics, `id = @ideaId AND created_by = @uid AND status = 'draft'`, {
          ideaId,
          uid: user.id,
        });
        currentIdeaId = ideaId;
      } else {
        currentIdeaId = newId();
        await tx.insert('ideas', { id: currentIdeaId, ...basics, created_by: user.id, status: 'draft' });
      }

      // Child rows are replaced wholesale per section. Rows are mapped to an
      // explicit column list so optional fields are always present (insertMany
      // takes its columns from the first row).
      if (data.team_members) {
        await tx.execute('DELETE FROM idea_team_members WHERE idea_id = @id', { id: currentIdeaId });
        await tx.insertMany(
          'idea_team_members',
          data.team_members.map((m) => ({ idea_id: currentIdeaId, profile_id: m.profile_id, member_order: m.member_order }))
        );
      }

      if (data.impacts) {
        await tx.execute('DELETE FROM idea_impacts WHERE idea_id = @id', { id: currentIdeaId });
        await tx.insertMany(
          'idea_impacts',
          data.impacts.map((i) => ({
            idea_id: currentIdeaId,
            impact_kind: i.impact_kind,
            impact_type: i.impact_type,
            explanation: i.explanation || null,
            measurable_result: i.measurable_result ?? null,
          }))
        );
      }

      if (data.support_requests) {
        await tx.execute('DELETE FROM idea_support_requests WHERE idea_id = @id', { id: currentIdeaId });
        await tx.insertMany(
          'idea_support_requests',
          data.support_requests.map((s) => ({
            idea_id: currentIdeaId,
            support_area: s.support_area,
            details: s.details ?? null,
            reason: s.reason ?? null,
            estimate: s.estimate ?? null,
          }))
        );
      }

      if (data.mentor_preferences) {
        await tx.execute('DELETE FROM idea_mentor_preferences WHERE idea_id = @id', { id: currentIdeaId });
        await tx.insertMany(
          'idea_mentor_preferences',
          data.mentor_preferences.map((p) => ({
            idea_id: currentIdeaId,
            priority: p.priority,
            mentor_profile_id: p.mentor_profile_id,
          }))
        );
      }

      return currentIdeaId;
    })
  );
}

/**
 * Final submit. Delegates to the usp_submit_idea stored procedure
 * (db/migrations/0003_procedures.sql), which checks the caller owns the
 * idea, validates completeness, locks the row, flips status to 'submitted',
 * and routes to a reviewer — all inside one DB transaction so nothing can
 * race with a concurrent edit.
 */
export async function submitIdea(ideaId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' } as const;

  const { error } = await attempt(() => db.callProc('usp_submit_idea', { idea_id: ideaId, actor_id: user.id }));
  if (error) return { error } as const;

  revalidatePath('/my-ideas');
  return { ok: true } as const;
}
