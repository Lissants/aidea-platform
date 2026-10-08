/** Browser-side upload to app/api/files/[bucket] (admin only). */
export async function uploadFile(
  bucket: 'program-resources' | 'mentor-photos',
  prefix: string,
  file: File
): Promise<{ url: string; key: string } | { error: string }> {
  const body = new FormData();
  body.set('file', file);
  body.set('prefix', prefix);
  try {
    const res = await fetch(`/api/files/${bucket}`, { method: 'POST', body });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? `Upload failed (${res.status})` };
    return { url: json.url, key: json.key };
  } catch {
    return { error: 'Upload failed — check your connection and try again.' };
  }
}
