'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import { validateShowcaseImage } from '@/lib/validation/showcase-image';
import { parseFileUrl, removeByUrl, statStoredFile } from '@/lib/storage/local';

export interface ShowcaseQueueRow {
  idea_id: string;
  idea_title: string;
  team_name: string;
  short_description: string | null;
  image_url: string | null;
  published: boolean;
}

/** Build-decision ideas — eligible for showcase curation. Admin-only. */
export async function fetchShowcaseQueue(programId: string): Promise<ShowcaseQueueRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return [];

  return db.query<ShowcaseQueueRow>(
    `SELECT i.id AS idea_id, i.idea_title, i.team_name,
            sp.short_description, sp.image_url, CAST(ISNULL(sp.published, 0) AS BIT) AS published
       FROM ideas i
       JOIN qualifier_assessments qa ON qa.idea_id = i.id
       LEFT JOIN showcase_projects sp ON sp.idea_id = i.id
      WHERE i.program_id = @programId
        AND qa.status = 'finalized'
        AND qa.build_decision = 'build'`,
    { programId }
  );
}

/**
 * Saves the showcase content an admin curated. The image itself is
 * uploaded first through /api/files/showcase-images (admin-only, type and
 * size checked against the file's actual bytes — see lib/storage/local.ts);
 * this persists the resulting URL plus the description. The stored file's
 * recorded metadata is re-validated here so a URL can't point at something
 * that bypassed the upload checks.
 */
export async function saveShowcaseContent(
  ideaId: string,
  programId: string,
  input: { short_description: string; image_url: string | null }
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  if (input.image_url) {
    const file = parseFileUrl(input.image_url);
    if (!file || file.bucket !== 'showcase-images') {
      return { error: 'Image URL must point to the showcase-images storage bucket' } as const;
    }
    const meta = await statStoredFile(file.bucket, file.key);
    if (!meta) return { error: 'Uploaded image not found — please upload it again.' } as const;
    const validationError = validateShowcaseImage({ size: meta.size, type: meta.contentType });
    if (validationError) return { error: validationError } as const;
  }

  const existing = await db.queryOne<{ published: boolean; image_url: string | null }>(
    'SELECT published, image_url FROM showcase_projects WHERE idea_id = @ideaId',
    { ideaId }
  );
  if (existing?.published) {
    return { error: 'This showcase entry has already been published and can no longer be edited.' } as const;
  }

  const { error } = await attempt(() =>
    db.execute(
      `MERGE showcase_projects WITH (HOLDLOCK) AS t
       USING (SELECT @ideaId AS idea_id) AS s ON t.idea_id = s.idea_id
       WHEN MATCHED THEN UPDATE SET program_id = @programId, short_description = @short_description, image_url = @image_url
       WHEN NOT MATCHED THEN INSERT (idea_id, program_id, short_description, image_url)
         VALUES (@ideaId, @programId, @short_description, @image_url);`,
      { ideaId, programId, short_description: input.short_description, image_url: input.image_url }
    )
  );
  if (error) return { error } as const;

  // Replaced image: delete the old file so orphans don't pile up.
  if (existing?.image_url && existing.image_url !== input.image_url) await removeByUrl(existing.image_url);

  revalidatePath('/showcase-content');
  return { ok: true } as const;
}

export async function publishShowcaseProjects(programId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const { data, error } = await attempt(() =>
    db.callProc<{ published_count: number }>('usp_publish_batch', {
      program_id: programId,
      entity_type: 'showcase_project',
      actor_id: user.id,
    })
  );

  if (error) return { error } as const;
  revalidatePath('/showcase-content');
  revalidatePath('/showcase');
  return { ok: true, count: data?.[0]?.published_count ?? 0 } as const;
}
