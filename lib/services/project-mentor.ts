'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db } from '@/lib/db';
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
 * mentor; No Build ideas show as Not Applicable. Admin-only. */
export async function fetchProjectMentorQueue(programId: string): Promise<ProjectMentorQueueRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return [];

  return db.query<ProjectMentorQueueRow>(
    `SELECT i.id AS idea_id, i.idea_title, i.team_name, qa.build_decision,
            pma.mentor_profile_id AS assigned_mentor_id, p.full_name AS assigned_mentor_name,
            CAST(ISNULL(pma.published, 0) AS BIT) AS published
       FROM ideas i
       JOIN qualifier_assessments qa ON qa.idea_id = i.id AND qa.status = 'finalized'
       LEFT JOIN project_mentor_assignments pma ON pma.idea_id = i.id
       LEFT JOIN mentor_profiles mp ON mp.id = pma.mentor_profile_id
       LEFT JOIN profiles p ON p.id = mp.profile_id
      WHERE i.program_id = @programId`,
    { programId }
  );
}

/** Mentor picker options for the admin assignment screen. Admin-only. */
export async function fetchAllMentorOptions(): Promise<MentorOption[]> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return [];

  const rows = await db.query<{ mentor_profile_id: string; full_name: string | null }>(
    `SELECT mp.id AS mentor_profile_id, p.full_name
       FROM mentor_profiles mp
       LEFT JOIN profiles p ON p.id = mp.profile_id`
  );
  return rows.map((m) => ({ mentor_profile_id: m.mentor_profile_id, full_name: m.full_name ?? 'Mentor' }));
}

/**
 * Saves the project mentor pick. Deliberately does NOT notify anyone and
 * does NOT reveal the mentor to the team — only the separate Publish
 * action does that, per the save/finalize/publish separation.
 */
export async function saveProjectMentorAssignment(ideaId: string, mentorProfileId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const lockedMessage = 'This assignment has already been published and can no longer be changed here.';
  const existing = await db.queryOne<{ published: boolean }>(
    'SELECT published FROM project_mentor_assignments WHERE idea_id = @ideaId',
    { ideaId }
  );
  if (existing?.published) return { error: lockedMessage } as const;

  const { data: affected, error } = await attempt(() =>
    db.execute(
      `MERGE project_mentor_assignments WITH (HOLDLOCK) AS t
       USING (SELECT @ideaId AS idea_id) AS s ON t.idea_id = s.idea_id
       WHEN MATCHED AND t.published = 0 THEN UPDATE SET
         mentor_profile_id = @mentorProfileId, assigned_by = @uid, assigned_at = SYSDATETIMEOFFSET()
       WHEN NOT MATCHED THEN INSERT (idea_id, mentor_profile_id, assigned_by, assigned_at)
         VALUES (@ideaId, @mentorProfileId, @uid, SYSDATETIMEOFFSET());`,
      { ideaId, mentorProfileId, uid: user.id }
    )
  );

  if (error) return { error } as const;
  if (affected === 0) return { error: lockedMessage } as const;
  revalidatePath('/project-mentor');
  return { ok: true } as const;
}

/**
 * Publishes all ready project mentor assignments for the program via
 * usp_publish_batch, then — since that generic procedure only notifies each
 * idea's team, not the mentor — separately notifies each newly-published
 * assignment's mentor. Scoped to rows published_at >= the moment this call
 * started (read from the database clock), so re-running publish never
 * re-notifies already-published rows.
 */
export async function publishProjectMentorAssignments(programId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const clock = await db.queryOne<{ now: string }>('SELECT SYSDATETIMEOFFSET() AS now');
  const callStartedAt = clock?.now ?? new Date().toISOString();

  const { data, error } = await attempt(() =>
    db.callProc<{ published_count: number }>('usp_publish_batch', {
      program_id: programId,
      entity_type: 'project_mentor_assignment',
      actor_id: user.id,
    })
  );

  if (error) return { error } as const;

  const newlyPublished = await db.query<{ profile_id: string | null; idea_title: string | null }>(
    `SELECT mp.profile_id, i.idea_title
       FROM project_mentor_assignments pma
       JOIN ideas i ON i.id = pma.idea_id
       LEFT JOIN mentor_profiles mp ON mp.id = pma.mentor_profile_id
      WHERE pma.published = 1
        AND i.program_id = @programId
        AND pma.published_at >= @callStartedAt`,
    { programId, callStartedAt }
  );

  const notifications = newlyPublished
    .filter((row) => row.profile_id)
    .map((row) => ({
      user_id: row.profile_id,
      type: 'project_mentor_assigned',
      title: 'You have been assigned as a project mentor',
      body: `You are now the project mentor for "${row.idea_title ?? 'an idea'}".`,
      link: '/dashboard',
    }));
  // Best-effort, like before: the publish itself has already committed.
  const notified = await attempt(() => db.insertMany('notifications', notifications));
  if (notified.error) console.error('publishProjectMentorAssignments: mentor notifications failed:', notified.error);

  revalidatePath('/project-mentor');
  revalidatePath('/my-ideas');
  return { ok: true, count: data?.[0]?.published_count ?? 0 } as const;
}
