import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowedDomains, isAllowedEmail } from '@/lib/auth/email-domain';

afterEach(() => vi.unstubAllEnvs());

describe('ALLOWED_EMAIL_DOMAIN', () => {
  it('lets both Godrej domains in when both are listed', () => {
    vi.stubEnv('ALLOWED_EMAIL_DOMAIN', 'godrejcp.com, @GodrejInds.com');
    expect(allowedDomains()).toEqual(['godrejcp.com', 'godrejinds.com']);
    expect(isAllowedEmail('john.doe@godrejcp.com')).toBe(true);
    expect(isAllowedEmail('Jane.Doe@GODREJINDS.COM')).toBe(true);
  });

  it('refuses other domains, including look-alikes', () => {
    vi.stubEnv('ALLOWED_EMAIL_DOMAIN', 'godrejcp.com,godrejinds.com');
    expect(isAllowedEmail('someone@gmail.com')).toBe(false);
    expect(isAllowedEmail('someone@godrejinds.com.evil.com')).toBe(false);
    expect(isAllowedEmail('someone@sub.godrejinds.com')).toBe(false);
    expect(isAllowedEmail('no-at-sign')).toBe(false);
  });

  it('refuses godrejinds.com while only godrejcp.com is listed', () => {
    vi.stubEnv('ALLOWED_EMAIL_DOMAIN', 'godrejcp.com');
    expect(isAllowedEmail('jane.doe@godrejinds.com')).toBe(false);
  });
});
