import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ newId: () => 'id', db: {} }));

const { DEFAULT_TIER, assignedTier, settingsAssignedEmails } = await import('@/lib/auth/roles');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('assignedTier', () => {
  it('is null for everyone when nothing is listed', () => {
    vi.stubEnv('AD_DEVELOPER_EMAILS', '');
    vi.stubEnv('AD_ADMIN_EMAILS', '');
    expect(assignedTier('christopher.gerard@godrejcp.com')).toBeNull();
    expect(DEFAULT_TIER).toBe('participant');
  });

  it('matches listed emails ignoring case and spaces, with , or ; separators', () => {
    vi.stubEnv('AD_DEVELOPER_EMAILS', ' Christopher.Gerard@godrejcp.com ');
    vi.stubEnv('AD_ADMIN_EMAILS', 'setyarini@godrejcp.com; pahru.rozi@godrejcp.com,fitri.damayanti@godrejcp.com');
    expect(assignedTier('christopher.gerard@GODREJCP.com')).toBe('developer');
    expect(assignedTier('setyarini@godrejcp.com')).toBe('admin');
    expect(assignedTier(' Pahru.Rozi@godrejcp.com')).toBe('admin');
    expect(assignedTier('fitri.damayanti@godrejcp.com')).toBe('admin');
    expect(assignedTier('someone.else@godrejcp.com')).toBeNull();
    expect(assignedTier('')).toBeNull();
    expect(settingsAssignedEmails()).toEqual({
      developers: ['christopher.gerard@godrejcp.com'],
      admins: ['setyarini@godrejcp.com', 'pahru.rozi@godrejcp.com', 'fitri.damayanti@godrejcp.com'],
    });
  });

  it('prefers Developer when an email is on both lists', () => {
    vi.stubEnv('AD_DEVELOPER_EMAILS', 'both@godrejcp.com');
    vi.stubEnv('AD_ADMIN_EMAILS', 'both@godrejcp.com');
    expect(assignedTier('both@godrejcp.com')).toBe('developer');
  });
});
