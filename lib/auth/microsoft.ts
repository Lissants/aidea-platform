import 'server-only';

import { ConfidentialClientApplication, CryptoProvider } from '@azure/msal-node';
import { db, newId } from '@/lib/db';

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

function defaultRoles() {
  return (process.env.SSO_DEFAULT_ROLES ?? 'participant,employee_voter')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * Finds the local user for a verified Entra identity, linking by `oid`
 * first and then by email (so seeded/pre-created accounts pick up SSO), or
 * provisions a new users + profiles row with SSO_DEFAULT_ROLES.
 * Returns null if the linked profile is deactivated.
 *
 * On every sign-in it also:
 * - drops an admin-issued temporary password (must_change_password = 1):
 *   Entra has proved who the user is, so the password the admin knows dies;
 * - refreshes the display name and email from Entra (email only when no
 *   other account already uses it).
 */
export async function findOrCreateSsoUser(identity: { oid: string; email: string; name: string }) {
  return db.transaction(async (tx) => {
    type Account = { id: string; email: string; must_change_password: boolean };
    let account = await tx.queryOne<Account>(
      'SELECT id, email, must_change_password FROM users WITH (UPDLOCK, HOLDLOCK) WHERE entra_oid = @oid',
      { oid: identity.oid }
    );

    let linkOid = false;
    if (!account) {
      account = await tx.queryOne<Account>(
        'SELECT id, email, must_change_password FROM users WITH (UPDLOCK, HOLDLOCK) WHERE email = @email',
        { email: identity.email }
      );
      linkOid = Boolean(account);
    }

    if (!account) {
      const id = newId();
      await tx.insert('users', { id, email: identity.email, entra_oid: identity.oid });
      account = { id, email: identity.email, must_change_password: false };
    }

    const profile = await tx.queryOne<{ active: boolean }>('SELECT active FROM profiles WHERE id = @id', {
      id: account.id,
    });
    if (profile?.active === false) return null;

    if (linkOid) {
      await tx.update('users', { entra_oid: identity.oid }, 'id = @id', { id: account.id });
    }
    if (account.must_change_password) {
      await tx.update('users', { password_hash: null, must_change_password: false }, 'id = @id', { id: account.id });
    }

    if (account.email !== identity.email) {
      const taken = await tx.queryOne<{ id: string }>('SELECT id FROM users WHERE email = @email AND id <> @id', {
        email: identity.email,
        id: account.id,
      });
      if (!taken) {
        await tx.update('users', { email: identity.email }, 'id = @id', { id: account.id });
        if (profile) await tx.update('profiles', { email: identity.email }, 'id = @id', { id: account.id });
        account = { ...account, email: identity.email };
      }
    }

    if (!profile) {
      await tx.insert('profiles', { id: account.id, email: account.email, full_name: identity.name || account.email });
      await tx.execute(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT @user_id, r.id FROM roles r WHERE r.name IN (@roles)`,
        { user_id: account.id, roles: defaultRoles() }
      );
    } else if (identity.name) {
      await tx.update('profiles', { full_name: identity.name }, 'id = @id', { id: account.id });
    }

    return { id: account.id, email: account.email };
  });
}
