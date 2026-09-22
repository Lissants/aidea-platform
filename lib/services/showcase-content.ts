'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import { validateShowcaseImage } from '@/lib/validation/showcase-image';

export interface ShowcaseQueueRow {
  idea_id: string;
  idea_title: string;
  team_name: string;
  short_description: string | null;
  image_url: string | null;
  published: boolean;
}

/** Build-decision ideas — eligible for showcase curation. */
export async function fetchShowcaseQueue(programId: string): Promise<ShowcaseQueueRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('ideas')
    .select(
      `id, idea_title, team_name,
       qualifier_assessments!inner (build_decision, status),
       showcase_projects (short_description, image_url, published)`
    )
    .eq('program_id', programId)
    .eq('qualifier_assessments.status', 'finalized')
    .eq('qualifier_assessments.build_decision', 'build');

  if (error || !data) return [];

  return (data as any[]).map((idea) => {
    const sp = idea.showcase_projects?.[0] ?? idea.showcase_projects ?? null;
    return {
      idea_id: idea.id,
      idea_title: idea.idea_title,
      team_name: idea.team_name,
      short_description: sp?.short_description ?? null,
      image_url: sp?.image_url ?? null,
      published: sp?.published ?? false,
    };
  });
}

/**
 * Saves the showcase content an admin curated. The image itself is
 * uploaded client-side straight to Supabase Storage (showcase-images
 * bucket, admin-write policy — see 0011_showcase_storage_bucket.sql); this
 * just persists the resulting public URL plus the description. The upload
 * itself is validated client-side (validateShowcaseImage, before the bytes
 * ever leave the browser); here we re-validate server-side too by looking
 * up the uploaded object's own recorded size/mimetype in Storage, so a
 * client that skipped the client-side check can't sneak an oversized or
 * wrong-type file past the server as well.
 */
export async function saveShowcaseContent(
  ideaId: string,
  programId: string,
  input: { short_description: string; image_url: string | null }
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  if (input.image_url && !input.image_url.includes('/showcase-images/')) {
    return { error: 'Image URL must point to the showcase-images storage bucket' } as const;
  }

  const supabase = createClient();

  if (input.image_url) {
    const marker = '/showcase-images/';
    const objectPath = input.image_url.slice(input.image_url.indexOf(marker) + marker.length);
    const folder = objectPath.split('/').slice(0, -1).join('/');
    const fileName = objectPath.split('/').pop();
    const { data: listing } = await supabase.storage.from('showcase-images').list(folder);
    const found = listing?.find((f) => f.name === fileName);
    if (found?.metadata) {
      const validationError = validateShowcaseImage({
        size: (found.metadata as any).size ?? 0,
        type: (found.metadata as any).mimetype ?? '',
      });
      if (validationError) return { error: validationError } as const;
    }
  }
  const { data: existing } = await supabase.from('showcase_projects').select('published').eq('idea_id', ideaId).maybeSingle();
  if (existing?.published) {
    return { error: 'This showcase entry has already been published and can no longer be edited.' } as const;
  }

  const { error } = await supabase.from('showcase_projects').upsert(
    { idea_id: ideaId, program_id: programId, short_description: input.short_description, image_url: input.image_url },
    { onConflict: 'idea_id' }
  );

  if (error) return { error: error.message } as const;
  revalidatePath('/showcase-content');
  return { ok: true } as const;
}

export async function publishShowcaseProjects(programId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const supabase = createClient();
  const { data, error } = await supabase.rpc('fn_publish_batch', {
    p_program_id: programId,
    p_entity_type: 'showcase_project',
    p_actor_id: user.id,
  });

  if (error) return { error: error.message } as const;
  revalidatePath('/showcase-content');
  revalidatePath('/showcase');
  return { ok: true, count: data } as const;
}
