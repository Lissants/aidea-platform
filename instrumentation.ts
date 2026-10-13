/**
 * Runs once when the server starts. Warns about production settings that
 * would let traffic travel unencrypted (see IIS_DEPLOYMENT.md, "Encryption")
 * or leave sign-in, which is Active Directory only, broken or too open.
 */
export function register() {
  if (process.env.NODE_ENV !== 'production' || process.env.NEXT_RUNTIME !== 'nodejs') return;

  const warn = (message: string) => console.warn(`[security] ${message}`);
  if (!process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://')) {
    warn('NEXT_PUBLIC_APP_URL is not https:// — serve AIdea over HTTPS only.');
  }
  if (process.env.SESSION_COOKIE_SECURE === 'false') {
    warn('SESSION_COOKIE_SECURE=false — session cookies can be sent over plain HTTP.');
  }
  if (process.env.MSSQL_ENCRYPT === 'false') {
    warn('MSSQL_ENCRYPT=false — database traffic is not encrypted.');
  }
  if (process.env.MSSQL_TRUST_CERT === 'true') {
    warn('MSSQL_TRUST_CERT=true — the SQL Server certificate is not validated.');
  }
  const ldapUrls = (process.env.LDAP_URL ?? '').split(',').map((u) => u.trim()).filter(Boolean);
  if (!ldapUrls.length) {
    console.error('[auth] LDAP_URL is not set — nobody can sign in. Set it to the ldaps:// domain controllers.');
  } else if (ldapUrls.some((u) => !u.toLowerCase().startsWith('ldaps://'))) {
    console.error('[auth] LDAP_URL must use ldaps:// — AD sign-in stays off, so nobody can sign in.');
  }
  if (!process.env.ALLOWED_EMAIL_DOMAIN) {
    warn('ALLOWED_EMAIL_DOMAIN is not set — any AD account with any email domain can sign in.');
  }
}
