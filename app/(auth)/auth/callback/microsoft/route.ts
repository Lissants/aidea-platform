import { NextResponse, type NextRequest } from 'next/server';
import {
  MS_FLOW_COOKIE,
  MS_SCOPES,
  appOrigin,
  findOrCreateSsoUser,
  isMicrosoftSsoEnabled,
  microsoftRedirectUri,
  msalClient,
} from '@/lib/auth/microsoft';
import { isAllowedEmail } from '@/lib/auth/email-domain';
import { postSignInPath } from '@/lib/auth/post-sign-in';
import { startSession } from '@/lib/auth/session';

/**
 * Microsoft Entra redirect target: validates state, redeems the code (with
 * the PKCE verifier), checks tenant + ALLOWED_EMAIL_DOMAIN, links or
 * provisions the local user, then issues the app session cookie and sends
 * the user to the page they asked for or their role's home (/overview).
 *
 * A sign-in AIdea did not start (no flow cookie, e.g. opened from a Microsoft
 * My Apps / Grove tile) is restarted through /auth/microsoft instead of
 * failing, so the user still lands in AIdea.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = appOrigin(request.url);
  const fail = (reason: string) => {
    const res = NextResponse.redirect(`${origin}/session-error?reason=${encodeURIComponent(reason)}`);
    res.cookies.delete({ name: MS_FLOW_COOKIE, path: '/auth/callback/microsoft' });
    return res;
  };

  if (!isMicrosoftSsoEnabled()) return fail('sso_disabled');
  if (searchParams.get('error')) return fail('sso_cancelled');

  let flow: { state: string; verifier: string; redirectTo: string } | null = null;
  try {
    flow = JSON.parse(request.cookies.get(MS_FLOW_COOKIE)?.value ?? '');
  } catch {
    flow = null;
  }
  if (!flow?.state || !flow.verifier) {
    return NextResponse.redirect(`${origin}/auth/microsoft?redirect_to=${encodeURIComponent('/overview')}`);
  }
  const code = searchParams.get('code');
  if (!code || searchParams.get('state') !== flow.state) return fail('sso_state');

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

  await startSession(account.id, account.email, 'sso');

  const res = NextResponse.redirect(`${origin}${await postSignInPath(account.id, flow.redirectTo)}`);
  res.cookies.delete({ name: MS_FLOW_COOKIE, path: '/auth/callback/microsoft' });
  return res;
}
