'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db } from '@/lib/db';
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

/** Admin mentor directory (includes mentor emails). Admin-only — this is a
 * Server Action module, so it's callable directly, not just via the page. */
export async function fetchMentorDirectory(programId: string): Promise<MentorDirectoryRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return [];

  // Active = pending assignments on this program's ideas.
  return db.query<MentorDirectoryRow>(
    `SELECT mp.id AS mentor_profile_id, mp.profile_id,
            ISNULL(p.full_name, 'Mentor') AS full_name, ISNULL(p.email, '') AS email,
            mp.expertise, mp.bio, mp.max_capacity,
            (SELECT COUNT(*) FROM review_assignments ra
               JOIN ideas i ON i.id = ra.idea_id
              WHERE ra.mentor_profile_id = mp.id AND ra.status = 'pending' AND i.program_id = @programId) AS active_count
       FROM mentor_profiles mp
       LEFT JOIN profiles p ON p.id = mp.profile_id`,
    { programId }
  );
}

/** Admin adjustment of a mentor's max review capacity. Audited since it
 * directly changes how usp_route_reviewer allocates future submissions. */
export async function updateMentorCapacity(mentorProfileId: string, newCapacity: number) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;
  if (!Number.isFinite(newCapacity) || newCapacity < 1) return { error: 'Capacity must be at least 1' } as const;

  const { data: before, error: readError } = await attempt(() =>
    db.queryOne<{ max_capacity: number }>('SELECT max_capacity FROM mentor_profiles WHERE id = @id', { id: mentorProfileId })
  );
  if (readError || !before) return { error: 'Mentor not found' } as const;

  const { error } = await attempt(() =>
    db.update('mentor_profiles', { max_capacity: newCapacity }, 'id = @id', { id: mentorProfileId })
  );
  if (error) return { error } as const;

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
