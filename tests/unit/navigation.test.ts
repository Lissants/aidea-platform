import { describe, expect, it } from 'vitest';
import { NAVIGATION, getDefaultRole } from '@/lib/constants/navigation';

describe('navigation config', () => {
  it('gives every role at least one nav item', () => {
    for (const role of Object.keys(NAVIGATION) as (keyof typeof NAVIGATION)[]) {
      expect(NAVIGATION[role].length).toBeGreaterThan(0);
    }
  });

  it('picks the highest-privilege role by default', () => {
    expect(getDefaultRole(['participant', 'admin', 'mentor'])).toBe('admin');
    expect(getDefaultRole(['employee_voter'])).toBe('employee_voter');
    expect(getDefaultRole([])).toBeNull();
  });

  it('ranks developer above admin and gives it the admin pages incl. User Management', () => {
    expect(getDefaultRole(['admin', 'developer'])).toBe('developer');
    expect(NAVIGATION.developer.map((i) => i.href)).toEqual(NAVIGATION.admin.map((i) => i.href));
    expect(NAVIGATION.admin.some((i) => i.href === '/roles')).toBe(true);
  });

  it('shows the Mentor Profile page to every role', () => {
    for (const role of Object.keys(NAVIGATION) as (keyof typeof NAVIGATION)[]) {
      expect(NAVIGATION[role].some((i) => i.href === '/mentor-profile')).toBe(true);
    }
  });
});
