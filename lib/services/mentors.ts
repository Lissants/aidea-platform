'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import { logAudit } from '@/lib/audit/log';
import { removeByUrl } from '@/lib/storage/local';
import { mentorProfileSchema, type MentorProfileInput } from '@/lib/validation/schemas';

export interface MentorDirectoryRow {
  mentor_profile_id: string;
  profile_id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  department: string | null;
  expertise: string | null;
  bio: string | null;
  photo_url: string | null;
  max_capacity: number;
  active_count: number;
}

/** What any signed-in user may see about a mentor (no capacity or load). */
export interface PublicMentorProfile {
  id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  department: string | null;
  expertise: string | null;
  photo_url: string | null;
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
            p.job_title, p.department, mp.expertise, mp.bio, mp.photo_url, mp.max_capacity,
            (SELECT COUNT(*) FROM review_assignments ra
               JOIN ideas i ON i.id = ra.idea_id
              WHERE ra.mentor_profile_id = mp.id AND ra.status = 'pending' AND i.program_id = @programId) AS active_count
       FROM mentor_profiles mp
       LEFT JOIN profiles p ON p.id = mp.profile_id
      ORDER BY p.full_name`,
    { programId }
  );
}

/** Participant-facing Mentor Profile page. Any signed-in user; mentor
 * profiles are readable by everyone (see profileReadFilter). Hides
 * deactivated accounts and users who no longer hold the mentor role. */
export async function fetchPublicMentorProfiles(): Promise<PublicMentorProfile[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  return db.query<PublicMentorProfile>(
    `SELECT mp.id, p.full_name, p.email, p.job_title, p.department, mp.expertise, mp.photo_url
       FROM mentor_profiles mp
       JOIN profiles p ON p.id = mp.profile_id
      WHERE p.active = 1
        AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                     WHERE ur.user_id = p.id AND r.name = 'mentor')
      ORDER BY p.full_name`
  );
}

/** Admin edit of the mentor card: photo, title (profiles.job_title) and
 * expertise paragraph. Audited; a replaced/removed photo file is deleted. */
export async function updateMentorProfile(mentorProfileId: string, input: MentorProfileInput) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const parsed = mentorProfileSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const;
  const job_title = parsed.data.job_title || null;
  const expertise = parsed.data.expertise || null;
  const photo_url = parsed.data.photo_url;

  const { data: before, error: readError } = await attempt(() =>
    db.queryOne<{ id: string; profile_id: string; job_title: string | null; expertise: string | null; photo_url: string | null }>(
      `SELECT mp.id, mp.profile_id, p.job_title, mp.expertise, mp.photo_url
         FROM mentor_profiles mp JOIN profiles p ON p.id = mp.profile_id
        WHERE mp.id = @id`,
      { id: mentorProfileId }
    )
  );
  if (readError || !before) return { error: 'Mentor not found' } as const;

  // An uploaded photo is stored under this mentor's own folder; reject
  // URLs pointing at another mentor's file.
  if (photo_url && photo_url !== before.photo_url && !photo_url.startsWith(`/api/files/mentor-photos/${before.id.toLowerCase()}/`)) {
    return { error: 'Invalid photo' } as const;
  }

  const { error } = await attempt(() =>
    db.transaction(async (tx) => {
      await tx.update('mentor_profiles', { expertise, photo_url }, 'id = @id', { id: before.id });
      await tx.execute('UPDATE profiles SET job_title = @job_title, updated_at = SYSDATETIMEOFFSET() WHERE id = @id', {
        job_title,
        id: before.profile_id,
      });
    })
  );
  if (error) return { error } as const;

  if (before.photo_url && before.photo_url !== photo_url) await removeByUrl(before.photo_url);

  await logAudit({
    entityType: 'mentor_profile',
    entityId: mentorProfileId,
    actorId: user.id,
    action: 'mentor_profile_updated',
    priorValue: { job_title: before.job_title, expertise: before.expertise, photo_url: before.photo_url },
    newValue: { job_title, expertise, photo_url },
  });

  revalidatePath('/mentors');
  revalidatePath('/mentor-profile');
  return { ok: true } as const;
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
