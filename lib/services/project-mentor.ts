'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';

export interface ProjectMentorQueueRow {
  idea_id: string;
  idea_title: string;
  team_name: string;
  build_decision: 'build' | 'no_build' | null;
  assigned_mentor_id: string | null;
  assigned_mentor_name: string | null;
  published: boolean;
}

export interface MentorOption {
  mentor_profile_id: string;
  full_name: string;
}

/** Ideas that reached a qualifier decision — Build ideas need a project
 * mentor; No Build ideas show as Not Applicable. */
export async function fetchProjectMentorQueue(programId: string): Promise<ProjectMentorQueueRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('ideas')
    .select(
      `id, idea_title, team_name,
       qualifier_assessments!inner (build_decision, status),
       project_mentor_assignments (mentor_profile_id, published, mentor_profiles (profiles (full_name)))`
    )
    .eq('program_id', programId)
    .eq('qualifier_assessments.status', 'finalized');

  if (error || !data) return [];

  return (data as any[]).map((idea) => {
    const qa = idea.qualifier_assessments?.[0] ?? idea.qualifier_assessments ?? null;
    const pma = idea.project_mentor_assignments?.[0] ?? idea.project_mentor_assignments ?? null;
    return {
      idea_id: idea.id,
      idea_title: idea.idea_title,
      team_name: idea.team_name,
      build_decision: qa?.build_decision ?? null,
      assigned_mentor_id: pma?.mentor_profile_id ?? null,
      assigned_mentor_name: pma?.mentor_profiles?.profiles?.full_name ?? null,
      published: pma?.published ?? false,
    };
  });
}

export async function fetchAllMentorOptions(): Promise<MentorOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('mentor_profiles').select('id, profiles(full_name)');
  return (data ?? []).map((m: any) => ({ mentor_profile_id: m.id, full_name: m.profiles?.full_name ?? 'Mentor' }));
}

/**
 * Saves the project mentor pick. Deliberately does NOT notify anyone and
 * does NOT reveal the mentor to the team — only the separate Publish
 * action does that, per the save/finalize/publish separation.
 */
export async function saveProjectMentorAssignment(ideaId: string, mentorProfileId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('project_mentor_assignments')
    .select('published')
    .eq('idea_id', ideaId)
    .maybeSingle();
  if (existing?.published) {
    return { error: 'This assignment has already been published and can no longer be changed here.' } as const;
  }

  const { error } = await supabase.from('project_mentor_assignments').upsert(
    { idea_id: ideaId, mentor_profile_id: mentorProfileId, assigned_by: user.id, assigned_at: new Date().toISOString() },
    { onConflict: 'idea_id' }
  );

  if (error) return { error: error.message } as const;
  revalidatePath('/project-mentor');
  return { ok: true } as const;
}

/**
 * Publishes all ready project mentor assignments for the program via
 * fn_publish_batch, then — since that generic function only notifies each
 * idea's team, not the mentor — separately notifies each newly-published
 * assignment's mentor. Scoped to rows published_at >= the moment this call
 * started, so re-running publish never re-notifies already-published rows.
 */
export async function publishProjectMentorAssignments(programId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const callStartedAt = new Date().toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_publish_batch', {
    p_program_id: programId,
    p_entity_type: 'project_mentor_assignment',
    p_actor_id: user.id,
  });

  if (error) return { error: error.message } as const;

  const { data: newlyPublished } = await supabase
    .from('project_mentor_assignments')
    .select('mentor_profile_id, idea_id, mentor_profiles(profile_id), ideas(idea_title)')
    .eq('published', true)
    .gte('published_at', callStartedAt);

  for (const row of (newlyPublished as any[]) ?? []) {
    const profileId = row.mentor_profiles?.profile_id;
    if (!profileId) continue;
    await supabase.from('notifications').insert({
      user_id: profileId,
      type: 'project_mentor_assigned',
      title: 'You have been assigned as a project mentor',
      body: `You are now the project mentor for "${row.ideas?.idea_title ?? 'an idea'}".`,
      link: '/dashboard',
    });
  }

  revalidatePath('/project-mentor');
  revalidatePath('/my-ideas');
  return { ok: true, count: data } as const;
}
