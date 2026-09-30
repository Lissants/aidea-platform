/** Only same-origin absolute paths are allowed as post-sign-in redirects (no open redirect). */
export function safeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}
