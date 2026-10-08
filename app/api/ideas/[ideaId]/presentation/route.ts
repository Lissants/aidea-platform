import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/permissions';
import { removeByUrl, removeStoredFile, saveFile } from '@/lib/storage/local';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Team upload of the idea's presentation (.pptx / .pdf, 25MB), open only
 * once the qualifier result is published as Build. A route handler rather
 * than a Server Action because Server Actions cap request bodies at 1MB.
 * Re-uploading replaces (and deletes) the previous file.
 * Multipart form with `file`; responds with { url, name }.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ ideaId: string }> }) {
  const ideaId = (await params).ideaId.toLowerCase();
  if (!UUID_RE.test(ideaId)) return NextResponse.json({ error: 'Idea not found' }, { status: 404 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const idea = await db.queryOne<{ presentation_url: string | null; is_member: boolean; is_build: boolean }>(
    `SELECT i.presentation_url,
            dbo.fn_is_idea_team_member(i.id, @uid) AS is_member,
            CAST(CASE WHEN qa.published = 1 AND qa.build_decision = 'build' THEN 1 ELSE 0 END AS BIT) AS is_build
       FROM ideas i
       LEFT JOIN qualifier_assessments qa ON qa.idea_id = i.id
      WHERE i.id = @ideaId`,
    { ideaId, uid: user.id }
  );
  if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
  if (!idea.is_member && !isAdmin(user.roles)) return NextResponse.json({ error: 'Only the idea team can upload its presentation.' }, { status: 403 });
  if (!idea.is_build) return NextResponse.json({ error: 'Uploads open once your idea is marked Build.' }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  let saved;
  try {
    saved = await saveFile('idea-presentations', ideaId, file);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  try {
    await db.execute(
      `UPDATE ideas
          SET presentation_url = @url, presentation_name = @name,
              presentation_uploaded_at = SYSDATETIMEOFFSET(), presentation_uploaded_by = @uid
        WHERE id = @ideaId`,
      { url: saved.url, name: saved.meta.originalName, uid: user.id, ideaId }
    );
  } catch {
    await removeStoredFile('idea-presentations', saved.key).catch(() => undefined);
    return NextResponse.json({ error: 'Could not save the presentation. Please try again.' }, { status: 500 });
  }

  if (idea.presentation_url && idea.presentation_url !== saved.url) await removeByUrl(idea.presentation_url);

  revalidatePath('/my-ideas');
  revalidatePath(`/ideas/${ideaId}`);
  revalidatePath('/dashboard');
  revalidatePath('/final-presentation');
  return NextResponse.json({ url: saved.url, name: saved.meta.originalName });
}
