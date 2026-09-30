/**
 * ALLOWED_EMAIL_DOMAIN gate (comma-separated list, e.g.
 * "godrejcp.com,godrejinds.com"). Unset means any domain is accepted, which
 * is only intended for local development.
 */
export function allowedDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

export function isAllowedEmail(email: string) {
  const domains = allowedDomains();
  if (domains.length === 0) return true;
  const domain = email.toLowerCase().split('@')[1] ?? '';
  return domains.includes(domain);
}
