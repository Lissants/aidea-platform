'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { ideaDraftSchema, type IdeaDraftInput } from '@/lib/validation/schemas';

/**
 * Creates or updates the participant's idea draft (basics + team + impacts +
 * support requests + mentor preferences) in a single transaction-ish pass.
 * Draft rows can be freely edited — RLS (see 0099_rls.sql,
 * "participants_crud_own_drafts") only allows this while status='draft' and
 * created_by = auth.uid().
 */
export async function saveIdeaDraft(programId: string, ideaId: string | null, input: IdeaDraftInput) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' } as const;

  const parsed = ideaDraftSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const;
  }

  const supabase = await createClient();
  const basics = {
    program_id: programId,
    team_name: parsed.data.team_name ?? '',
    team_leader_id: user.id,
    idea_title: parsed.data.idea_title ?? '',
    problem_opportunity: parsed.data.problem_opportunity ?? '',
    proposed_solution: parsed.data.proposed_solution ?? '',
    target_users: parsed.data.target_users ?? null,
    created_by: user.id,
    status: 'draft' as const,
  };

  let currentIdeaId = ideaId;

  if (currentIdeaId) {
    const { error } = await supabase.from('ideas').update(basics).eq('id', currentIdeaId).eq('status', 'draft');
    if (error) return { error: error.message } as const;
  } else {
    const { data, error } = await supabase.from('ideas').insert(basics).select('id').single();
    if (error) return { error: error.message } as const;
    currentIdeaId = data.id;
  }

  if (parsed.data.team_members) {
    await supabase.from('idea_team_members').delete().eq('idea_id', currentIdeaId);
    if (parsed.data.team_members.length > 0) {
      await supabase.from('idea_team_members').insert(
        parsed.data.team_members.map((m) => ({ ...m, idea_id: currentIdeaId }))
      );
    }
  }

  if (parsed.data.impacts) {
    await supabase.from('idea_impacts').delete().eq('idea_id', currentIdeaId);
    if (parsed.data.impacts.length > 0) {
      await supabase.from('idea_impacts').insert(
        parsed.data.impacts.map((i) => ({ ...i, idea_id: currentIdeaId }))
      );
    }
  }

  if (parsed.data.support_requests) {
    await supabase.from('idea_support_requests').delete().eq('idea_id', currentIdeaId);
    if (parsed.data.support_requests.length > 0) {
      await supabase.from('idea_support_requests').insert(
        parsed.data.support_requests.map((s) => ({ ...s, idea_id: currentIdeaId }))
      );
    }
  }

  if (parsed.data.mentor_preferences) {
    await supabase.from('idea_mentor_preferences').delete().eq('idea_id', currentIdeaId);
    if (parsed.data.mentor_preferences.length > 0) {
      await supabase.from('idea_mentor_preferences').insert(
        parsed.data.mentor_preferences.map((p) => ({ ...p, idea_id: currentIdeaId }))
      );
    }
  }

  revalidatePath('/my-ideas');
  return { ok: true, ideaId: currentIdeaId } as const;
}

/**
 * Final submit. Delegates to the fn_submit_idea Postgres function (see
 * supabase/migrations/0007_functions.sql), which validates completeness,
 * locks the row, flips status to 'submitted', and routes to a reviewer —
 * all inside one DB transaction so nothing can race with a concurrent edit.
 */
export async function submitIdea(ideaId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' } as const;

  const supabase = await createClient();
  const { error } = await supabase.rpc('fn_submit_idea', { p_idea_id: ideaId, p_actor_id: user.id });

  if (error) return { error: error.message } as const;

  revalidatePath('/my-ideas');
  return { ok: true } as const;
}
