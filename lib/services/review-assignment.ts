'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import { logAudit } from '@/lib/audit/log';

export interface RoutingQueueRow {
  assignment_id: string;
  idea_id: string;
  idea_title: string;
  team_name: string;
  status: 'pending' | 'routing_required' | 'reassigned';
  current_mentor_id: string | null;
  current_mentor_name: string | null;
  preferences: { priority: number; mentor_profile_id: string; mentor_name: string }[];
}

export interface MentorCapacityRow {
  mentor_profile_id: string;
  full_name: string;
  max_capacity: number;
  active_count: number;
}

/** Every idea currently needing review-assignment attention (routing
 * required or already assigned), with each idea's Preferred Mentor 1 & 2. */
export async function fetchRoutingQueue(programId: string): Promise<RoutingQueueRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('review_assignments')
    .select(
      `id, idea_id, status,
       mentor_profiles (id, profiles (full_name)),
       ideas!inner (idea_title, team_name, program_id,
         idea_mentor_preferences (priority, mentor_profiles (id, profiles (full_name))))`
    )
    .eq('ideas.program_id', programId)
    .order('assigned_at', { ascending: false });

  if (error || !data) return [];

  return (data as any[]).map((row) => {
    const currentMentor = row.mentor_profiles ?? null;
    const prefs = row.ideas?.idea_mentor_preferences ?? [];
    return {
      assignment_id: row.id,
      idea_id: row.idea_id,
      idea_title: row.ideas?.idea_title ?? 'Untitled',
      team_name: row.ideas?.team_name ?? '',
      status: row.status,
      current_mentor_id: currentMentor?.id ?? null,
      current_mentor_name: currentMentor?.profiles?.full_name ?? null,
      preferences: prefs.map((p: any) => ({
        priority: p.priority,
        mentor_profile_id: p.mentor_profiles?.id,
        mentor_name: p.mentor_profiles?.profiles?.full_name ?? 'Unknown',
      })),
    };
  });
}

/** Mentor capacity snapshot ("7 of 10") for the assignment picker. */
export async function fetchMentorCapacities(programId: string): Promise<MentorCapacityRow[]> {
  const supabase = await createClient();

  const { data: mentors } = await supabase.from('mentor_profiles').select('id, max_capacity, profiles(full_name)');
  if (!mentors) return [];

  const { data: activeAssignments } = await supabase
    .from('review_assignments')
    .select('mentor_profile_id, ideas!inner(program_id)')
    .eq('status', 'pending')
    .eq('ideas.program_id', programId);

  const counts = new Map<string, number>();
  for (const a of (activeAssignments as any[]) ?? []) {
    if (!a.mentor_profile_id) continue;
    counts.set(a.mentor_profile_id, (counts.get(a.mentor_profile_id) ?? 0) + 1);
  }

  return (mentors as any[]).map((m) => ({
    mentor_profile_id: m.id,
    full_name: m.profiles?.full_name ?? 'Mentor',
    max_capacity: m.max_capacity,
    active_count: counts.get(m.id) ?? 0,
  }));
}

/**
 * Manual assignment / change-reviewer action. Changing an already-assigned
 * (status='pending') reviewer requires a mandatory reason and writes an
 * audit_logs row; a first-time assignment out of the routing_required
 * queue doesn't need one. Program-managed capacity limits are advisory
 * here (the UI shows "7 of 10") — fn_route_reviewer is what enforces
 * capacity for the *automatic* path; a manual admin override is allowed to
 * exceed it deliberately, same as most real programs need an escape hatch.
 */
export async function assignReviewer(
  assignmentId: string,
  ideaId: string,
  newMentorProfileId: string,
  options: { previousMentorProfileId?: string | null; reason?: string } = {}
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const isChange = !!options.previousMentorProfileId && options.previousMentorProfileId !== newMentorProfileId;
  if (isChange && (!options.reason || options.reason.trim().length < 5)) {
    return { error: 'A reason is required when changing an already-assigned reviewer' } as const;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('review_assignments')
    .update({ mentor_profile_id: newMentorProfileId, status: 'pending', assigned_at: new Date().toISOString() })
    .eq('id', assignmentId);

  if (error) return { error: error.message } as const;

  await logAudit({
    entityType: 'review_assignment',
    entityId: assignmentId,
    actorId: user.id,
    action: isChange ? 'reviewer_changed' : 'reviewer_assigned',
    priorValue: { mentor_profile_id: options.previousMentorProfileId ?? null },
    newValue: { mentor_profile_id: newMentorProfileId },
    reason: options.reason ?? null,
  });

  // Notify the newly assigned mentor.
  const { data: mentorProfile } = await supabase.from('mentor_profiles').select('profile_id').eq('id', newMentorProfileId).single();
  if (mentorProfile) {
    await supabase.from('notifications').insert({
      user_id: mentorProfile.profile_id,
      type: 'review_assigned',
      title: 'New idea assigned for review',
      body: 'An idea has been assigned to you for review.',
      link: '/reviews',
    });
  }

  revalidatePath('/review-assignment');
  return { ok: true } as const;
}
