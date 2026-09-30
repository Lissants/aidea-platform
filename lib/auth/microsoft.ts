import 'server-only';

import { ConfidentialClientApplication, CryptoProvider } from '@azure/msal-node';
import { db, newId } from '@/lib/db';

/**
 * Microsoft Entra ID (Azure AD) single sign-on via the OAuth 2.0
 * authorization-code flow with PKCE. Enabled only when MICROSOFT_TENANT_ID,
 * MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are all set.
 *
 * App registration (IT): Web platform, redirect URI
 *   {NEXT_PUBLIC_APP_URL}/auth/callback/microsoft
 * and the delegated `openid profile email` scopes.
 */

export const MS_FLOW_COOKIE = 'aidea_ms_flow';
export const MS_SCOPES = ['openid', 'profile', 'email'];

export function isMicrosoftSsoEnabled() {
  return Boolean(
    process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
  );
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

export function microsoftRedirectUri(origin: string) {
  return `${process.env.NEXT_PUBLIC_APP_URL || origin}/auth/callback/microsoft`;
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
 */
export async function findOrCreateSsoUser(identity: { oid: string; email: string; name: string }) {
  return db.transaction(async (tx) => {
    let account = await tx.queryOne<{ id: string; email: string }>(
      'SELECT id, email FROM users WITH (UPDLOCK, HOLDLOCK) WHERE entra_oid = @oid',
      { oid: identity.oid }
    );

    if (!account) {
      account = await tx.queryOne<{ id: string; email: string }>(
        'SELECT id, email FROM users WITH (UPDLOCK, HOLDLOCK) WHERE email = @email',
        { email: identity.email }
      );
      if (account) {
        await tx.update('users', { entra_oid: identity.oid }, 'id = @id', { id: account.id });
      }
    }

    if (!account) {
      const id = newId();
      await tx.insert('users', { id, email: identity.email, entra_oid: identity.oid });
      account = { id, email: identity.email };
    }

    const profile = await tx.queryOne<{ active: boolean }>('SELECT active FROM profiles WHERE id = @id', {
      id: account.id,
    });
    if (!profile) {
      await tx.insert('profiles', { id: account.id, email: identity.email, full_name: identity.name || identity.email });
      await tx.execute(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT @user_id, r.id FROM roles r WHERE r.name IN (@roles)`,
        { user_id: account.id, roles: defaultRoles() }
      );
    } else if (profile.active === false) {
      return null;
    }

    return account;
  });
}
