import { describe, expect, it } from 'vitest';
import { can, isAdmin, isMentor, isParticipant, isEmployeeVoter, hasAnyRole } from '@/lib/permissions';

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
