/**
 * App-owned session cookie (replaces Supabase Auth's session cookies).
 *
 * The cookie holds an HS256 JWT signed with SESSION_SECRET: `sub` is the
 * users.id, plus the email for display/logging and `amr` (how the user signed
 * in: 'sso' or 'pwd', used to also sign out of Microsoft). It carries no roles —
 * roles are always re-read from SQL by getCurrentUser(), so a role change
 * takes effect on the next request. Deliberately free of `next/headers` and
 * DB imports so proxy.ts can use it too.
 */
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'aidea_session';
/** Absolute lifetime of one token. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
/** Tokens older than this are re-issued by the proxy (sliding expiry). */
export const SESSION_REFRESH_AFTER_SECONDS = 60 * 60;

const DEV_FALLBACK_SECRET = 'aidea-dev-only-session-secret-change-me-0123456789';

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET must be set (at least 32 characters) in production.');
    }
    return new TextEncoder().encode(DEV_FALLBACK_SECRET);
  }
  return new TextEncoder().encode(secret);
}

export type SignInMethod = 'sso' | 'pwd';

export interface SessionClaims {
  sub: string;
  email: string;
  amr: SignInMethod;
  iat: number;
  exp: number;
}

export async function createSessionToken(userId: string, email: string, amr: SignInMethod) {
  return new SignJWT({ email, amr })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setIssuer('aidea-platform')
    .sign(secretKey());
}

/** Returns the claims for a valid, unexpired token, otherwise null (never throws). */
export async function verifySessionToken(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: 'aidea-platform', algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    const amr: SignInMethod = payload.amr === 'sso' ? 'sso' : 'pwd';
    return { sub: payload.sub, email: payload.email, amr, iat: payload.iat ?? 0, exp: payload.exp ?? 0 };
  } catch {
    return null;
  }
}

/**
 * Whether auth cookies get the Secure flag. Override with
 * SESSION_COOKIE_SECURE=false only for plain-HTTP intranet deployments; the
 * default follows NODE_ENV.
 */
export function secureCookies() {
  return process.env.SESSION_COOKIE_SECURE
    ? process.env.SESSION_COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production';
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: secureCookies(),
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}
