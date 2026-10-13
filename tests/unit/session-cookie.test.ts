import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { MAX_SESSION_AGE_SECONDS, createSessionToken, verifySessionToken } from '@/lib/auth/session-cookie';

const now = () => Math.floor(Date.now() / 1000);
const HOUR = 60 * 60;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('session age cap', () => {
  it('is 24 hours', () => {
    expect(MAX_SESSION_AGE_SECONDS).toBe(24 * HOUR);
  });

  it('stamps a new sign-in with the current time', async () => {
    const claims = await verifySessionToken(await createSessionToken('u1', 'a@godrejcp.com', 'ldap'));
    expect(Math.abs((claims?.authTime ?? 0) - now())).toBeLessThanOrEqual(1);
  });

  it('keeps the original sign-in time when the token is re-issued', async () => {
    const signedIn = now() - 5 * HOUR;
    const reissued = await verifySessionToken(await createSessionToken('u1', 'a@godrejcp.com', 'ldap', signedIn));
    expect(reissued?.authTime).toBe(signedIn);
  });

  it('rejects a session signed in more than 24 hours ago, however recently it was re-issued', async () => {
    const fresh = await createSessionToken('u1', 'a@godrejcp.com', 'ldap', now() - 23 * HOUR);
    const stale = await createSessionToken('u1', 'a@godrejcp.com', 'ldap', now() - 25 * HOUR);
    expect(await verifySessionToken(fresh)).not.toBeNull();
    expect(await verifySessionToken(stale)).toBeNull();
  });

  it('counts a token from before auth_time existed from its own issue time', async () => {
    const secret = 'unit-test-session-secret-0123456789-abcdef';
    vi.stubEnv('SESSION_SECRET', secret);
    const legacy = await new SignJWT({ email: 'a@godrejcp.com', amr: 'pwd' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setIssuedAt()
      .setExpirationTime('8h')
      .setIssuer('aidea-platform')
      .sign(new TextEncoder().encode(secret));
    const claims = await verifySessionToken(legacy);
    expect(claims?.authTime).toBe(claims?.iat);
  });
});
