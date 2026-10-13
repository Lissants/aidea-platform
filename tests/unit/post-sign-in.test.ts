import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppRole } from '@/lib/constants/navigation';

const roles = vi.hoisted(() => ({ current: [] as AppRole[] }));
vi.mock('@/lib/auth/session', () => ({ getUserRoles: vi.fn(async () => roles.current) }));

import { postSignInPath } from '@/lib/auth/post-sign-in';
import { roleHomePath } from '@/lib/constants/navigation';

describe('roleHomePath', () => {
  it('sends every staff and participant role to /overview', () => {
    for (const role of ['developer', 'admin', 'mentor', 'participant'] as AppRole[]) {
      expect(roleHomePath([role])).toBe('/overview');
    }
  });

  it('sends voters to /voting, unless they also hold a higher role', () => {
    expect(roleHomePath(['employee_voter'])).toBe('/voting');
    expect(roleHomePath(['employee_voter', 'participant'])).toBe('/overview');
  });

  it('returns null without a role', () => {
    expect(roleHomePath([])).toBeNull();
  });
});

describe('postSignInPath', () => {
  beforeEach(() => {
    roles.current = ['participant'];
  });

  it('keeps a same-origin deep link', async () => {
    expect(await postSignInPath('u1', '/reviews/123')).toBe('/reviews/123');
  });

  it.each([undefined, null, '', '/', '/sign-in', '/sign-in?x=1'])('sends %s to the role home', async (requested) => {
    expect(await postSignInPath('u1', requested)).toBe('/overview');
  });

  it('never follows an external URL', async () => {
    for (const requested of ['//evil.example', 'https://grove.godrej.com', '/\\evil.example']) {
      expect(await postSignInPath('u1', requested)).toBe('/overview');
    }
  });

  it('sends voters to /voting and users without a role to /access-denied', async () => {
    roles.current = ['employee_voter'];
    expect(await postSignInPath('u1', '/')).toBe('/voting');
    roles.current = [];
    expect(await postSignInPath('u1', '/')).toBe('/access-denied');
  });
});
