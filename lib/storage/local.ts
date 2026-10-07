import 'server-only';

import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Local-disk file storage (replaces Supabase Storage buckets).
 *
 * Layout:  {UPLOAD_DIR}/{bucket}/{prefix}/{uuid}.{ext}  + a `.meta.json` sidecar
 * holding the content type, size and original file name. `prefix` is the
 * owning idea/program id. Keys are always server-generated, and every key
 * that comes back in from a URL is validated against KEY_RE before touching
 * the filesystem, so path traversal is impossible.
 *
 * Files are served by app/api/files/[bucket]/[...key]/route.ts at
 * /api/files/{bucket}/{key}.
 */

export type Bucket = 'program-resources';

interface BucketConfig {
  maxBytes: number;
  /** Allowed MIME types; null = any type not in BLOCKED_TYPES. */
  types: string[] | null;
  /** Whether anonymous visitors may read or a session is required. */
  publicRead: boolean;
}

export const BUCKETS: Record<Bucket, BucketConfig> = {
  'program-resources': { maxBytes: 10 * 1024 * 1024, types: null, publicRead: false },
};

// Anything a browser would execute or render as active content.
const BLOCKED_TYPES = new Set(['text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/javascript', 'application/javascript']);
const BLOCKED_EXTENSIONS = new Set(['html', 'htm', 'xhtml', 'svg', 'js', 'mjs', 'exe', 'bat', 'cmd', 'ps1', 'sh']);

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const KEY_RE = new RegExp(`^${UUID}/${UUID}(\\.[a-z0-9]{1,8})?$`);
const PREFIX_RE = new RegExp(`^${UUID}$`);

export interface StoredFileMeta {
  contentType: string;
  size: number;
  originalName: string;
  uploadedAt: string;
}

export function isBucket(value: string): value is Bucket {
  return value === 'program-resources';
}

export function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
}

function resolveKey(bucket: Bucket, key: string) {
  if (!KEY_RE.test(key)) throw new Error('Invalid file key');
  const root = path.join(uploadRoot(), bucket);
  const full = path.join(root, ...key.split('/'));
  if (!full.startsWith(root + path.sep)) throw new Error('Invalid file key');
  return full;
}

export function publicUrl(bucket: Bucket, key: string) {
  return `/api/files/${bucket}/${key}`;
}

/** Parses `/api/files/{bucket}/{key}` (absolute or relative URL) back into its parts, or null. */
export function parseFileUrl(url: string): { bucket: Bucket; key: string } | null {
  let pathname = url;
  try {
    pathname = new URL(url, 'http://local').pathname;
  } catch {
    return null;
  }
  const m = /^\/api\/files\/([a-z-]+)\/(.+)$/.exec(pathname);
  if (!m || !isBucket(m[1]) || !KEY_RE.test(m[2])) return null;
  return { bucket: m[1], key: m[2] };
}

function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function extensionOf(name: string) {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

/**
 * Validates and writes an uploaded file. Throws an Error with a
 * user-presentable message when the file is rejected.
 */
export async function saveFile(bucket: Bucket, prefix: string, file: File) {
  const cfg = BUCKETS[bucket];
  if (!PREFIX_RE.test(prefix)) throw new Error('Invalid upload target');
  if (file.size === 0) throw new Error('File is empty');
  if (file.size > cfg.maxBytes) throw new Error(`File must be ${Math.round(cfg.maxBytes / 1024 / 1024)}MB or smaller.`);

  const buf = Buffer.from(await file.arrayBuffer());
  let contentType = file.type || 'application/octet-stream';
  const ext = extensionOf(file.name);

  if (cfg.types) {
    // Trust the bytes, not the browser-supplied type.
    const sniffed = sniffImageType(buf);
    if (!sniffed || !cfg.types.includes(sniffed)) throw new Error('Only PNG, JPEG or WebP images are allowed.');
    contentType = sniffed;
  } else if (BLOCKED_TYPES.has(contentType) || BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error('This file type is not allowed.');
  }

  const key = `${prefix}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
  const full = resolveKey(bucket, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf, { flag: 'wx' });
  const meta: StoredFileMeta = {
    contentType,
    size: buf.length,
    originalName: path.basename(file.name).slice(0, 200),
    uploadedAt: new Date().toISOString(),
  };
  await writeFile(`${full}.meta.json`, JSON.stringify(meta));
  return { key, url: publicUrl(bucket, key), meta };
}

export async function readStoredFile(bucket: Bucket, key: string) {
  const full = resolveKey(bucket, key);
  const [data, metaRaw] = await Promise.all([readFile(full), readFile(`${full}.meta.json`, 'utf-8').catch(() => null)]);
  const meta: StoredFileMeta = metaRaw
    ? JSON.parse(metaRaw)
    : { contentType: 'application/octet-stream', size: data.length, originalName: path.basename(full), uploadedAt: '' };
  return { data, meta };
}

/** Metadata for a stored file, or null if it doesn't exist. */
export async function statStoredFile(bucket: Bucket, key: string): Promise<StoredFileMeta | null> {
  try {
    const full = resolveKey(bucket, key);
    await stat(full);
    return JSON.parse(await readFile(`${full}.meta.json`, 'utf-8'));
  } catch {
    return null;
  }
}

export async function removeStoredFile(bucket: Bucket, key: string) {
  const full = resolveKey(bucket, key);
  await rm(full, { force: true });
  await rm(`${full}.meta.json`, { force: true });
}

/** Best-effort delete by public URL (ignores URLs that aren't ours). */
export async function removeByUrl(url: string | null | undefined) {
  const parsed = url ? parseFileUrl(url) : null;
  if (parsed) await removeStoredFile(parsed.bucket, parsed.key).catch(() => undefined);
}
