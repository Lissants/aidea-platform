import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { isAdmin } from '@/lib/permissions';
import { parseFileUrl, readStoredFile, removeByUrl, removeStoredFile, saveFile, statStoredFile } from '@/lib/storage/local';
import {
  PRESENTATION_STAGE_META,
  duplicatePresentationError,
  otherPresentationStage,
  parsePresentationStage,
} from '@/lib/ideas/presentation-stage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** True when the stored file behind `url` has exactly these bytes. */
async function isSameStoredFile(url: string | null, bytes: Buffer) {
  const parsed = url ? parseFileUrl(url) : null;
  if (!parsed) return false;
  const meta = await statStoredFile(parsed.bucket, parsed.key);
  if (meta && meta.size !== bytes.length) return false;
  try {
    const { data } = await readStoredFile(parsed.bucket, parsed.key);
    return data.equals(bytes);
  } catch {
    return false;
  }
}

/**
 * Team upload of one of the idea's two presentations (.pptx / .pdf, 25MB).
 * A route handler rather than a Server Action because Server Actions cap
 * request bodies at 1MB. Multipart form with `file`; `?stage=` picks the slot:
 *  - `screening`: open once the screening result is published as Pass
 *  - `final` (default): open once the qualifier result is published as Build
 * The two slots must hold different files. Re-uploading a slot replaces (and
 * deletes) its previous file. Responds with { url, name }.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ ideaId: string }> }) {
  const ideaId = (await params).ideaId.toLowerCase();
  if (!UUID_RE.test(ideaId)) return NextResponse.json({ error: 'Idea not found' }, { status: 404 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const stage = parsePresentationStage(request.nextUrl.searchParams.get('stage'));
  if (!stage) return NextResponse.json({ error: 'Unknown presentation type' }, { status: 400 });
  const cols = PRESENTATION_STAGE_META[stage].columns;

  const idea = await db.queryOne<{
    presentation_url: string | null;
    screening_presentation_url: string | null;
    is_member: boolean;
    is_pass: boolean;
    is_build: boolean;
  }>(
    `SELECT i.presentation_url, i.screening_presentation_url,
            dbo.fn_is_idea_team_member(i.id, @uid) AS is_member,
            CAST(CASE WHEN sd.published = 1 AND sd.decision = 'pass_to_qualifier' THEN 1 ELSE 0 END AS BIT) AS is_pass,
            CAST(CASE WHEN qa.published = 1 AND qa.build_decision = 'build' THEN 1 ELSE 0 END AS BIT) AS is_build
       FROM ideas i
       LEFT JOIN screening_decisions sd ON sd.idea_id = i.id
       LEFT JOIN qualifier_assessments qa ON qa.idea_id = i.id
      WHERE i.id = @ideaId`,
    { ideaId, uid: user.id }
  );
  if (!idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
  if (!idea.is_member && !isAdmin(user.roles)) return NextResponse.json({ error: 'Only the idea team can upload its presentation.' }, { status: 403 });
  const open = stage === 'screening' ? idea.is_pass : idea.is_build;
  if (!open) return NextResponse.json({ error: PRESENTATION_STAGE_META[stage].lockedError }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const otherUrl = otherPresentationStage(stage) === 'screening' ? idea.screening_presentation_url : idea.presentation_url;
  if (await isSameStoredFile(otherUrl, Buffer.from(await file.arrayBuffer()))) {
    return NextResponse.json({ error: duplicatePresentationError(stage) }, { status: 400 });
  }

  let saved;
  try {
    saved = await saveFile('idea-presentations', ideaId, file);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  try {
    // Column names come from PRESENTATION_STAGE_META, never from the request.
    await db.execute(
      `UPDATE ideas
          SET ${cols.url} = @url, ${cols.name} = @name,
              ${cols.uploadedAt} = SYSDATETIMEOFFSET(), ${cols.uploadedBy} = @uid
        WHERE id = @ideaId`,
      { url: saved.url, name: saved.meta.originalName, uid: user.id, ideaId }
    );
  } catch {
    await removeStoredFile('idea-presentations', saved.key).catch(() => undefined);
    return NextResponse.json({ error: 'Could not save the presentation. Please try again.' }, { status: 500 });
  }

  const previousUrl = stage === 'screening' ? idea.screening_presentation_url : idea.presentation_url;
  if (previousUrl && previousUrl !== saved.url) await removeByUrl(previousUrl);

  revalidatePath('/my-ideas');
  revalidatePath(`/ideas/${ideaId}`);
  revalidatePath('/dashboard');
  revalidatePath('/final-presentation');
  return NextResponse.json({ url: saved.url, name: saved.meta.originalName });
}
