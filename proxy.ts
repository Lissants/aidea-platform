import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_REFRESH_AFTER_SECONDS,
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
} from '@/lib/auth/session-cookie';

const PARTICIPANT_PREFIXES = ['/overview', '/my-ideas', '/submit'];
const MENTOR_PREFIXES = ['/dashboard', '/reviews'];
const ADMIN_PREFIXES = [
  '/program',
  '/ideas',
  '/review-assignment',
  '/screening',
  '/qualifier',
  '/project-mentor',
  '/final-presentation',
  '/mentors',
  '/reports',
  '/audit',
  '/roles',
  '/settings',
  '/voting-management',
  '/showcase-content',
];
// Shared across roles, only requires *some* authenticated role:
const SHARED_PROTECTED_PREFIXES = ['/voting', '/notifications', '/profile'];

const PUBLIC_PREFIXES = ['/sign-in', '/auth/microsoft', '/auth/callback', '/access-denied', '/session-error'];

/**
 * Cheap, DB-free gate: verifies the signed session cookie and redirects
 * anonymous visitors to /sign-in. Role checks (e.g. admin-only route groups)
 * happen server-side in the route-group layouts via getCurrentUser(), which
 * reads roles from SQL on every request. Also slides the session expiry by
 * re-issuing tokens older than SESSION_REFRESH_AFTER_SECONDS.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });
  const path = request.nextUrl.pathname;

  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    return response;
  }

  const claims = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  const needsAuth =
    PARTICIPANT_PREFIXES.some((p) => path.startsWith(p)) ||
    MENTOR_PREFIXES.some((p) => path.startsWith(p)) ||
    ADMIN_PREFIXES.some((p) => path.startsWith(p)) ||
    SHARED_PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  if (needsAuth && !claims) {
    const redirectUrl = new URL('/sign-in', request.url);
    redirectUrl.searchParams.set('redirect_to', path);
    return NextResponse.redirect(redirectUrl);
  }

  if (claims && Date.now() / 1000 - claims.iat > SESSION_REFRESH_AFTER_SECONDS) {
    response.cookies.set(SESSION_COOKIE, await createSessionToken(claims.sub, claims.email), sessionCookieOptions());
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
