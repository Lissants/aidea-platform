export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Shared client+server validation for image uploads (mentor photos). Lives
 * outside any 'use server' file since a 'use server' module may only
 * export async server actions — this plain sync helper is imported by both
 * the client upload component and the storage layer.
 */
export function validateImage(file: { size: number; type: string }): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'Only PNG, JPEG or WebP images are allowed.';
  if (file.size > MAX_IMAGE_BYTES) return 'Image must be 5MB or smaller.';
  return null;
}
