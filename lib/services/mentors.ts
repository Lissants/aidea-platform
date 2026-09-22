'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import { logAudit } from '@/lib/audit/log';

export interface MentorDirectoryRow {
  mentor_profile_id: string;
  profile_id: string;
  full_name: string;
  email: string;
  expertise: string | null;
  bio: string | null;
  max_capacity: number;
  active_count: number;
}

export async function fetchMentorDirectory(programId: string): Promise<MentorDirectoryRow[]> {
  const supabase = await createClient();

  const { data: mentors } = await supabase.from('mentor_profiles').select('id, profile_id, expertise, bio, max_capacity, profiles(full_name, email)');
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
    profile_id: m.profile_id,
    full_name: m.profiles?.full_name ?? 'Mentor',
    email: m.profiles?.email ?? '',
    expertise: m.expertise,
    bio: m.bio,
    max_capacity: m.max_capacity,
    active_count: counts.get(m.id) ?? 0,
  }));
}

/** Admin adjustment of a mentor's max review capacity. Audited since it
 * directly changes how fn_route_reviewer allocates future submissions. */
export async function updateMentorCapacity(mentorProfileId: string, newCapacity: number) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;
  if (!Number.isFinite(newCapacity) || newCapacity < 1) return { error: 'Capacity must be at least 1' } as const;

  const supabase = await createClient();
  const { data: before } = await supabase.from('mentor_profiles').select('max_capacity').eq('id', mentorProfileId).maybeSingle();
  if (!before) return { error: 'Mentor not found' } as const;

  const { error } = await supabase.from('mentor_profiles').update({ max_capacity: newCapacity }).eq('id', mentorProfileId);
  if (error) return { error: error.message } as const;

  await logAudit({
    entityType: 'mentor_profile',
    entityId: mentorProfileId,
    actorId: user.id,
    action: 'mentor_capacity_updated',
    priorValue: { max_capacity: before.max_capacity },
    newValue: { max_capacity: newCapacity },
  });

  revalidatePath('/mentors');
  return { ok: true } as const;
}
