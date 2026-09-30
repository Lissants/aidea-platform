'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db } from '@/lib/db';
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
 * required or already assigned), with each idea's Preferred Mentor 1 & 2.
 * Admin-only (Server Action module, so callable directly). */
export async function fetchRoutingQueue(programId: string): Promise<RoutingQueueRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return [];

  const { data: rows, error } = await attempt(() =>
    db.query<{
      id: string;
      idea_id: string;
      status: RoutingQueueRow['status'];
      idea_title: string | null;
      team_name: string | null;
      mentor_profile_id: string | null;
      mentor_name: string | null;
    }>(
      `SELECT ra.id, ra.idea_id, ra.status, i.idea_title, i.team_name,
              mp.id AS mentor_profile_id, p.full_name AS mentor_name
         FROM review_assignments ra
         JOIN ideas i ON i.id = ra.idea_id
         LEFT JOIN mentor_profiles mp ON mp.id = ra.mentor_profile_id
         LEFT JOIN profiles p ON p.id = mp.profile_id
        WHERE i.program_id = @programId
        ORDER BY ra.assigned_at DESC`,
      { programId }
    )
  );
  if (error || !rows) return [];

  const prefs = await db.query<{ idea_id: string; priority: number; mentor_profile_id: string; mentor_name: string | null }>(
    `SELECT imp.idea_id, imp.priority, imp.mentor_profile_id, p.full_name AS mentor_name
       FROM idea_mentor_preferences imp
       JOIN ideas i ON i.id = imp.idea_id
       JOIN review_assignments ra ON ra.idea_id = i.id
       LEFT JOIN mentor_profiles mp ON mp.id = imp.mentor_profile_id
       LEFT JOIN profiles p ON p.id = mp.profile_id
      WHERE i.program_id = @programId
      ORDER BY imp.priority`,
    { programId }
  );
  const prefsByIdea = new Map<string, RoutingQueueRow['preferences']>();
  for (const p of prefs) {
    const list = prefsByIdea.get(p.idea_id) ?? [];
    list.push({ priority: p.priority, mentor_profile_id: p.mentor_profile_id, mentor_name: p.mentor_name ?? 'Unknown' });
    prefsByIdea.set(p.idea_id, list);
  }

  return rows.map((row) => ({
    assignment_id: row.id,
    idea_id: row.idea_id,
    idea_title: row.idea_title ?? 'Untitled',
    team_name: row.team_name ?? '',
    status: row.status,
    current_mentor_id: row.mentor_profile_id ?? null,
    current_mentor_name: row.mentor_name ?? null,
    preferences: prefsByIdea.get(row.idea_id) ?? [],
  }));
}

/** Mentor capacity snapshot ("7 of 10") for the assignment picker. Admin-only. */
export async function fetchMentorCapacities(programId: string): Promise<MentorCapacityRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return [];

  // Active = pending assignments on this program's ideas.
  return db.query<MentorCapacityRow>(
    `SELECT mp.id AS mentor_profile_id,
            ISNULL(p.full_name, 'Mentor') AS full_name,
            mp.max_capacity,
            (SELECT COUNT(*) FROM review_assignments ra
               JOIN ideas i ON i.id = ra.idea_id
              WHERE ra.mentor_profile_id = mp.id AND ra.status = 'pending' AND i.program_id = @programId) AS active_count
       FROM mentor_profiles mp
       LEFT JOIN profiles p ON p.id = mp.profile_id`,
    { programId }
  );
}

/**
 * Manual assignment / change-reviewer action. Changing an already-assigned
 * (status='pending') reviewer requires a mandatory reason and writes an
 * audit_logs row; a first-time assignment out of the routing_required
 * queue doesn't need one. Program-managed capacity limits are advisory
 * here (the UI shows "7 of 10") — usp_route_reviewer is what enforces
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

  const { data: updated, error } = await attempt(() =>
    db.update(
      'review_assignments',
      { mentor_profile_id: newMentorProfileId, status: 'pending', assigned_at: new Date().toISOString() },
      'id = @assignmentId',
      { assignmentId }
    )
  );

  if (error) return { error } as const;
  if (!updated) return { error: 'Review assignment not found' } as const;

  await logAudit({
    entityType: 'review_assignment',
    entityId: assignmentId,
    actorId: user.id,
    action: isChange ? 'reviewer_changed' : 'reviewer_assigned',
    priorValue: { mentor_profile_id: options.previousMentorProfileId ?? null },
    newValue: { mentor_profile_id: newMentorProfileId },
    reason: options.reason ?? null,
  });

  // Notify the newly assigned mentor (best-effort — the assignment itself
  // has already been saved).
  await attempt(async () => {
    const mentorProfile = await db.queryOne<{ profile_id: string }>(
      'SELECT profile_id FROM mentor_profiles WHERE id = @id',
      { id: newMentorProfileId }
    );
    if (mentorProfile) {
      await db.insert('notifications', {
        user_id: mentorProfile.profile_id,
        type: 'review_assigned',
        title: 'New idea assigned for review',
        body: 'An idea has been assigned to you for review.',
        link: '/reviews',
      });
    }
  });

  revalidatePath('/review-assignment');
  return { ok: true } as const;
}
