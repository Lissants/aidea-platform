import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import { isBucket, saveFile } from '@/lib/storage/local';

/**
 * Admin-only upload: multipart form with `file` and `prefix` (the owning
 * program id for program-resources, mentor
 * profile id for mentor-photos).
 * Responds with { key, url }.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ bucket: string }> }) {
  const { bucket } = await params;
  // idea-presentations is written only via /api/ideas/[ideaId]/presentation (team upload, Build check).
  if (!isBucket(bucket) || bucket === 'idea-presentations') return NextResponse.json({ error: 'Unknown bucket' }, { status: 404 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!isAdmin(user.roles)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  }
  const file = form.get('file');
  const prefix = String(form.get('prefix') ?? '').toLowerCase();
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  try {
    const saved = await saveFile(bucket, prefix, file);
    return NextResponse.json({ key: saved.key, url: saved.url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
