import 'server-only';

import { ConfidentialClientApplication, CryptoProvider } from '@azure/msal-node';
import { findOrCreateDirectoryUser } from '@/lib/auth/provision';

/**
 * Microsoft Entra ID (Azure AD) single sign-on via the OAuth 2.0
 * authorization-code flow with PKCE. Enabled only when MICROSOFT_TENANT_ID,
 * MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are all set (and, in
 * production, NEXT_PUBLIC_APP_URL, so redirects never use a proxy's internal host).
 *
 * App registration (IT): Web platform, redirect URI
 *   {NEXT_PUBLIC_APP_URL}/auth/callback/microsoft
 * front-channel logout URL {NEXT_PUBLIC_APP_URL}/sign-in, and the delegated
 * `openid profile email` scopes.
 */

export const MS_FLOW_COOKIE = 'aidea_ms_flow';
export const MS_SCOPES = ['openid', 'profile', 'email'];

let warnedMissingAppUrl = false;

export function isMicrosoftSsoEnabled() {
  const configured = Boolean(
    process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
  );
  if (configured && process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_APP_URL) {
    if (!warnedMissingAppUrl) {
      console.error('[auth] Microsoft SSO is disabled: NEXT_PUBLIC_APP_URL must be set in production.');
      warnedMissingAppUrl = true;
    }
    return false;
  }
  return configured;
}

/**
 * PASSWORD_SIGNIN_ENABLED=false hides and refuses email + password sign-in.
 * Ignored while SSO is not configured, so nobody can be locked out entirely.
 */
export function isPasswordSignInEnabled() {
  return process.env.PASSWORD_SIGNIN_ENABLED !== 'false' || !isMicrosoftSsoEnabled();
}

let client: ConfidentialClientApplication | null = null;

export function msalClient() {
  if (!isMicrosoftSsoEnabled()) throw new Error('Microsoft SSO is not configured');
  client ??= new ConfidentialClientApplication({
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}`,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
    },
  });
  return client;
}

export const msCrypto = new CryptoProvider();

/** Public origin of the app: NEXT_PUBLIC_APP_URL, else the request's own origin (local dev). */
export function appOrigin(requestUrl: string) {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(requestUrl).origin).replace(/\/+$/, '');
}

export function microsoftRedirectUri(origin: string) {
  return `${origin}/auth/callback/microsoft`;
}

/** Entra front-channel sign-out, returning the browser to /sign-in afterwards. */
export function microsoftLogoutUrl(origin: string) {
  const url = new URL(`https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/logout`);
  url.searchParams.set('post_logout_redirect_uri', `${origin}/sign-in`);
  return url.toString();
}

/**
 * Finds or provisions the local user for a verified Entra identity, linking
 * by `oid` first and then by email. See findOrCreateDirectoryUser.
 */
export async function findOrCreateSsoUser(identity: { oid: string; email: string; name: string }) {
  return findOrCreateDirectoryUser({ idColumn: 'entra_oid', id: identity.oid, email: identity.email, name: identity.name });
}
