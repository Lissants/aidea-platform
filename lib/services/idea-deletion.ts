'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { attempt, db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isDeveloper } from '@/lib/permissions';
import { logAudit } from '@/lib/audit/log';
import { removeByUrl } from '@/lib/storage/local';

const idsSchema = z.array(z.string().uuid()).min(1, 'Select at least one idea').max(100, 'Delete at most 100 ideas at a time');

/**
 * Developer-only hard delete of ideas (clearing test data before UAT).
 * Every child table cascades from ideas except votes (fk_votes_ideas is NO
 * ACTION) and reviews (removed via review_assignments, deleted explicitly
 * here so the order never depends on cascade timing). Stored files
 * (presentations) are removed after commit, best-effort.
 */
export async function deleteIdeas(ideaIds: string[]) {
  const user = await getCurrentUser();
  if (!user || !isDeveloper(user.roles)) return { error: 'Not authorized' } as const;

  const parsed = idsSchema.safeParse([...new Set(ideaIds.map((id) => id.toLowerCase()))]);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const;

  const params: Record<string, string> = {};
  parsed.data.forEach((id, i) => (params[`id${i}`] = id));
  const inList = parsed.data.map((_, i) => `@id${i}`).join(', ');

  const { data: ideas, error } = await attempt(() =>
    db.transaction(async (tx) => {
      const found = await tx.query<{
        id: string;
        program_id: string;
        idea_title: string;
        team_name: string;
        status: string;
        presentation_url: string | null;
      }>(
        `SELECT i.id, i.program_id, i.idea_title, i.team_name, i.status, i.presentation_url
           FROM ideas i
          WHERE i.id IN (${inList})`,
        params
      );
      if (found.length === 0) return found;
      await tx.execute(`DELETE FROM votes WHERE idea_id IN (${inList})`, params);
      await tx.execute(`DELETE FROM reviews WHERE idea_id IN (${inList})`, params);
      await tx.execute(`DELETE FROM ideas WHERE id IN (${inList})`, params);
      return found;
    })
  );
  if (error || !ideas) return { error: error ?? 'Could not delete ideas' } as const;
  if (ideas.length === 0) return { error: 'Those ideas no longer exist' } as const;

  for (const idea of ideas) {
    await removeByUrl(idea.presentation_url);
    await logAudit({
      programId: idea.program_id,
      entityType: 'idea',
      entityId: idea.id,
      actorId: user.id,
      action: 'idea_deleted',
      priorValue: { idea_title: idea.idea_title, team_name: idea.team_name, status: idea.status },
      reason: 'Developer clean-up',
    });
  }

  for (const path of ['/ideas', '/my-ideas', '/dashboard', '/reviews', '/screening', '/qualifier', '/review-assignment', '/project-mentor', '/final-presentation', '/reports', '/overview', '/voting', '/voting-management', '/']) {
    revalidatePath(path);
  }
  return { ok: true, deleted: ideas.length } as const;
}
