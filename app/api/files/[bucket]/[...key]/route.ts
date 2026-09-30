import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session-cookie';
import { BUCKETS, isBucket, readStoredFile } from '@/lib/storage/local';

const INLINE_TYPES = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/plain)$/;

/**
 * Serves stored files. showcase-images are public (like the old public
 * bucket); program-resources require a signed-in session. Files are
 * immutable (keys are random per upload), so they cache aggressively.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ bucket: string; key: string[] }> }) {
  const { bucket, key } = await params;
  if (!isBucket(bucket)) return new NextResponse('Not found', { status: 404 });

  if (!BUCKETS[bucket].publicRead) {
    const claims = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!claims) return new NextResponse('Not authenticated', { status: 401 });
  }

  let file;
  try {
    file = await readStoredFile(bucket, key.join('/'));
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  const inline = INLINE_TYPES.test(file.meta.contentType);
  const filename = file.meta.originalName.replace(/["\r\n]/g, '');
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.meta.contentType,
      'Content-Length': String(file.data.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(file.meta.originalName)}`,
      'Cache-Control': BUCKETS[bucket].publicRead ? 'public, max-age=31536000, immutable' : 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
