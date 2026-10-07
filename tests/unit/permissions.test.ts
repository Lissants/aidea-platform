import { describe, expect, it } from 'vitest';
import { can, canManageUser, isAdmin, isMentor, isParticipant, isEmployeeVoter, hasAnyRole, tierOf } from '@/lib/permissions';
import { USER_TIERS } from '@/lib/constants/navigation';

describe('permissions matrix', () => {
  it('lets an admin decide screening outcomes', () => {
    expect(can('screening:decide', 'admin')).toBe(true);
    expect(can('screening:decide', 'participant')).toBe(false);
  });

  it('lets a mentor edit only their own non-submitted review', () => {
    expect(can('review:edit_own_draft', 'mentor', { isAssignedMentor: true })).toBe(true);
    expect(can('review:edit_own_draft', 'participant')).toBe(false);
  });

  it('role-check helpers read the roles array correctly', () => {
    const roles = ['participant', 'employee_voter'] as const;
    expect(isParticipant([...roles])).toBe(true);
    expect(isAdmin([...roles])).toBe(false);
    expect(isMentor([...roles])).toBe(false);
    expect(isEmployeeVoter([...roles])).toBe(true);
    expect(hasAnyRole([...roles], ['admin', 'employee_voter'])).toBe(true);
  });
});

describe('developer role', () => {
  it('passes every admin check', () => {
    expect(isAdmin(['developer'])).toBe(true);
    expect(can('screening:decide', 'developer')).toBe(true);
    expect(can('user:manage', 'developer')).toBe(true);
    expect(can('user:manage', 'mentor')).toBe(false);
  });

  it('tierOf returns the highest tier held and ignores employee_voter', () => {
    expect(tierOf(['employee_voter', 'participant'])).toBe('participant');
    expect(tierOf(['mentor', 'admin'])).toBe('admin');
    expect(tierOf(['admin', 'developer'])).toBe('developer');
    expect(tierOf(['employee_voter'])).toBeNull();
  });

  it('lets a developer manage every tier', () => {
    for (const t of USER_TIERS) {
      expect(canManageUser(['developer'], t)).toBe(true);
      expect(canManageUser(['developer'], 'participant', t)).toBe(true);
    }
  });

  it('lets an admin manage only user and mentor accounts', () => {
    expect(canManageUser(['admin'], 'participant', 'mentor')).toBe(true);
    expect(canManageUser(['admin'], 'mentor', 'participant')).toBe(true);
    expect(canManageUser(['admin'], 'admin')).toBe(false);
    expect(canManageUser(['admin'], 'developer')).toBe(false);
    expect(canManageUser(['admin'], 'participant', 'admin')).toBe(false);
    expect(canManageUser(['admin'], 'participant', 'developer')).toBe(false);
  });

  it('gives mentors and participants no user management', () => {
    expect(canManageUser(['mentor'], 'participant')).toBe(false);
    expect(canManageUser(['participant', 'employee_voter'], 'participant')).toBe(false);
  });
});
