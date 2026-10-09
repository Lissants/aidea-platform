/**
 * App-owned session cookie (replaces Supabase Auth's session cookies).
 *
 * The cookie holds an HS256 JWT signed with SESSION_SECRET: `sub` is the
 * users.id, plus the email for display/logging, `amr` (how the user signed
 * in: 'sso', 'ldap' or 'pwd', used to also sign out of Microsoft) and
 * `auth_time` (when the password was last checked). It carries no roles —
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
/**
 * However active the session, the password is asked for again this long after
 * sign-in. AIdea can't re-check AD in between, so this bounds how long a
 * disabled Windows account keeps access.
 */
export const MAX_SESSION_AGE_SECONDS = 24 * 60 * 60;

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

/** 'sso' = Microsoft Entra, 'ldap' = on-prem AD password, 'pwd' = local AIdea password. */
export type SignInMethod = 'sso' | 'ldap' | 'pwd';

export interface SessionClaims {
  sub: string;
  email: string;
  amr: SignInMethod;
  iat: number;
  exp: number;
  /** When the user signed in (seconds); kept when the proxy re-issues the token. */
  authTime: number;
}

/** `authTime` (seconds) is carried over on re-issue; a new sign-in leaves it out. */
export async function createSessionToken(userId: string, email: string, amr: SignInMethod, authTime?: number) {
  return new SignJWT({ email, amr, auth_time: authTime ?? Math.floor(Date.now() / 1000) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setIssuer('aidea-platform')
    .sign(secretKey());
}

/**
 * Returns the claims for a valid, unexpired token signed in less than
 * MAX_SESSION_AGE_SECONDS ago, otherwise null (never throws).
 */
export async function verifySessionToken(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: 'aidea-platform', algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    const amr: SignInMethod = payload.amr === 'sso' || payload.amr === 'ldap' ? payload.amr : 'pwd';
    const iat = payload.iat ?? 0;
    // Tokens issued before auth_time existed count from their own issue time.
    const authTime = typeof payload.auth_time === 'number' ? payload.auth_time : iat;
    if (Date.now() / 1000 - authTime > MAX_SESSION_AGE_SECONDS) return null;
    return { sub: payload.sub, email: payload.email, amr, iat, exp: payload.exp ?? 0, authTime };
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
