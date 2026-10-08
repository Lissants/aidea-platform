import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { createSessionToken, verifySessionToken } from '@/lib/auth/session-cookie';
import {
  appOrigin,
  isMicrosoftSsoEnabled,
  isPasswordSignInEnabled,
  microsoftLogoutUrl,
  microsoftRedirectUri,
} from '@/lib/auth/microsoft';

function configureSso() {
  vi.stubEnv('MICROSOFT_TENANT_ID', 'tenant-123');
  vi.stubEnv('MICROSOFT_CLIENT_ID', 'client-123');
  vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'secret');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('session token sign-in method', () => {
  it('round-trips the amr claim', async () => {
    const sso = await verifySessionToken(await createSessionToken('u1', 'a@godrejcp.com', 'sso'));
    const pwd = await verifySessionToken(await createSessionToken('u1', 'a@godrejcp.com', 'pwd'));
    expect(sso?.amr).toBe('sso');
    expect(pwd?.amr).toBe('pwd');
  });

  it('treats tokens issued before amr existed as password sessions', async () => {
    const secret = 'unit-test-session-secret-0123456789-abcdef';
    vi.stubEnv('SESSION_SECRET', secret);
    const legacy = await new SignJWT({ email: 'a@godrejcp.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .setIssuer('aidea-platform')
      .sign(new TextEncoder().encode(secret));
    expect((await verifySessionToken(legacy))?.amr).toBe('pwd');
  });
});

describe('Microsoft SSO configuration', () => {
  it('is off until all three Microsoft variables are set', () => {
    vi.stubEnv('MICROSOFT_TENANT_ID', 'tenant-123');
    vi.stubEnv('MICROSOFT_CLIENT_ID', '');
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', '');
    expect(isMicrosoftSsoEnabled()).toBe(false);
    configureSso();
    expect(isMicrosoftSsoEnabled()).toBe(true);
  });

  it('stays off in production without NEXT_PUBLIC_APP_URL', () => {
    configureSso();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(isMicrosoftSsoEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://aidea.godrejcp.com');
    expect(isMicrosoftSsoEnabled()).toBe(true);
  });

  it('builds redirect and logout URLs from the public app URL, not the request host', () => {
    configureSso();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://aidea.godrejcp.com/');
    const origin = appOrigin('http://127.0.0.1:3000/auth/microsoft');
    expect(origin).toBe('https://aidea.godrejcp.com');
    expect(microsoftRedirectUri(origin)).toBe('https://aidea.godrejcp.com/auth/callback/microsoft');
    const logout = new URL(microsoftLogoutUrl(origin));
    expect(logout.origin + logout.pathname).toBe('https://login.microsoftonline.com/tenant-123/oauth2/v2.0/logout');
    expect(logout.searchParams.get('post_logout_redirect_uri')).toBe('https://aidea.godrejcp.com/sign-in');
  });

  it('falls back to the request origin when NEXT_PUBLIC_APP_URL is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(appOrigin('http://localhost:3000/auth/microsoft?x=1')).toBe('http://localhost:3000');
  });
});

describe('password sign-in switch', () => {
  it('is on by default', () => {
    configureSso();
    expect(isPasswordSignInEnabled()).toBe(true);
  });

  it('turns off with PASSWORD_SIGNIN_ENABLED=false once SSO is configured', () => {
    configureSso();
    vi.stubEnv('PASSWORD_SIGNIN_ENABLED', 'false');
    expect(isPasswordSignInEnabled()).toBe(false);
  });

  it('cannot be turned off while SSO is not configured, so nobody is locked out', () => {
    vi.stubEnv('MICROSOFT_TENANT_ID', '');
    vi.stubEnv('PASSWORD_SIGNIN_ENABLED', 'false');
    expect(isPasswordSignInEnabled()).toBe(true);
  });
});
