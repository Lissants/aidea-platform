import { NextResponse, type NextRequest } from 'next/server';
import {
  MS_FLOW_COOKIE,
  MS_SCOPES,
  findOrCreateSsoUser,
  isMicrosoftSsoEnabled,
  microsoftRedirectUri,
  msalClient,
} from '@/lib/auth/microsoft';
import { isAllowedEmail } from '@/lib/auth/email-domain';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { startSession } from '@/lib/auth/session';

/**
 * Microsoft Entra redirect target: validates state, redeems the code (with
 * the PKCE verifier), checks tenant + ALLOWED_EMAIL_DOMAIN, links or
 * provisions the local user, then issues the app session cookie.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${origin}/session-error?reason=${encodeURIComponent(reason)}`);
    res.cookies.delete({ name: MS_FLOW_COOKIE, path: '/auth/callback/microsoft' });
    return res;
  };

  if (!isMicrosoftSsoEnabled()) return fail('sso_disabled');
  if (searchParams.get('error')) return fail('sso_cancelled');

  let flow: { state: string; verifier: string; redirectTo: string };
  try {
    flow = JSON.parse(request.cookies.get(MS_FLOW_COOKIE)?.value ?? '');
  } catch {
    return fail('sso_state');
  }
  const code = searchParams.get('code');
  if (!code || !flow?.state || searchParams.get('state') !== flow.state) return fail('sso_state');

  let claims: Record<string, unknown>;
  try {
    const result = await msalClient().acquireTokenByCode({
      code,
      scopes: MS_SCOPES,
      redirectUri: microsoftRedirectUri(origin),
      codeVerifier: flow.verifier,
    });
    claims = (result?.idTokenClaims ?? {}) as Record<string, unknown>;
  } catch (err) {
    console.error('[auth] Microsoft code redemption failed', err);
    return fail('sso_exchange');
  }

  const oid = typeof claims.oid === 'string' ? claims.oid : null;
  const tid = typeof claims.tid === 'string' ? claims.tid : null;
  const email = String(claims.email ?? claims.preferred_username ?? '').trim().toLowerCase();
  const name = String(claims.name ?? '').trim();

  if (!oid || !email.includes('@')) return fail('sso_claims');
  if (tid !== process.env.MICROSOFT_TENANT_ID) return fail('sso_tenant');
  if (!isAllowedEmail(email)) return fail('domain_not_allowed');

  const account = await findOrCreateSsoUser({ oid, email, name });
  if (!account) return fail('account_deactivated');

  await startSession(account.id, account.email);

  const res = NextResponse.redirect(`${origin}${safeRedirectPath(flow.redirectTo)}`);
  res.cookies.delete({ name: MS_FLOW_COOKIE, path: '/auth/callback/microsoft' });
  return res;
}
