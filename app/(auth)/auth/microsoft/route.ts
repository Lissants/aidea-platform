import { NextResponse, type NextRequest } from 'next/server';
import {
  MS_FLOW_COOKIE,
  MS_SCOPES,
  isMicrosoftSsoEnabled,
  microsoftRedirectUri,
  msCrypto,
  msalClient,
} from '@/lib/auth/microsoft';
import { safeRedirectPath } from '@/lib/auth/redirect';

/**
 * Starts Microsoft Entra sign-in: generates PKCE + state, stashes them in a
 * short-lived httpOnly cookie, and redirects to the Microsoft login page.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  if (!isMicrosoftSsoEnabled()) {
    return NextResponse.redirect(`${origin}/sign-in?error=sso_disabled`);
  }

  const { verifier, challenge } = await msCrypto.generatePkceCodes();
  const state = msCrypto.createNewGuid();
  const redirectTo = safeRedirectPath(searchParams.get('redirect_to'));

  const authUrl = await msalClient().getAuthCodeUrl({
    scopes: MS_SCOPES,
    redirectUri: microsoftRedirectUri(origin),
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
    state,
    prompt: 'select_account',
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(MS_FLOW_COOKIE, JSON.stringify({ state, verifier, redirectTo }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/auth/callback/microsoft',
    maxAge: 10 * 60,
  });
  return response;
}
