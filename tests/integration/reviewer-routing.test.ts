/**
 * fn_route_reviewer (supabase/migrations/0007_functions.sql, extended by
 * 0015_voting_lifecycle_and_reviewer_notify.sql) is a SECURITY DEFINER
 * Postgres function — there is no JS call site for it outside `fn_submit_idea`
 * calling it internally, and this sandbox has no live Postgres/Supabase
 * project to run the actual migration against (see ASSUMPTIONS.md).
 *
 * `routeReviewer` below is a faithful, line-for-line JS port of that
 * function's documented algorithm: try priority-1 mentor if they have
 * capacity, else priority-2, else mark routing_required and notify every
 * admin. It operates on the exact same in-memory table shapes the real
 * tables use, so this test is a genuine regression guard on the documented
 * routing contract — but it does NOT verify the SQL migration itself.
 * Running the real migration's tests requires a live Supabase project
 * (`npm run seed` against one, then exercise fn_route_reviewer via RPC).
 */
import { beforeEach, describe, expect, it } from 'vitest';

interface MentorProfile {
  id: string;
  max_capacity: number;
}
interface Preference {
  idea_id: string;
  priority: 1 | 2;
  mentor_profile_id: string;
}
interface Assignment {
  idea_id: string;
  mentor_profile_id: string | null;
  status: 'pending' | 'routing_required';
}

function routeReviewer(
  ideaId: string,
  mentors: MentorProfile[],
  preferences: Preference[],
  assignments: Assignment[]
): { assignment: Assignment; notifiedAdmins: boolean } {
  const prefs = preferences.filter((p) => p.idea_id === ideaId).sort((a, b) => a.priority - b.priority);

  for (const pref of prefs) {
    const mentor = mentors.find((m) => m.id === pref.mentor_profile_id);
    if (!mentor) continue;
    const activeCount = assignments.filter((a) => a.mentor_profile_id === mentor.id && a.status === 'pending').length;
    if (activeCount < mentor.max_capacity) {
      const assignment: Assignment = { idea_id: ideaId, mentor_profile_id: mentor.id, status: 'pending' };
      assignments.push(assignment);
      return { assignment, notifiedAdmins: false };
    }
  }

  const assignment: Assignment = { idea_id: ideaId, mentor_profile_id: null, status: 'routing_required' };
  assignments.push(assignment);
  return { assignment, notifiedAdmins: true };
}

describe('fn_route_reviewer contract (routeReviewer JS mirror)', () => {
  let mentors: MentorProfile[];
  let assignments: Assignment[];

  beforeEach(() => {
    mentors = [
      { id: 'mentor-1', max_capacity: 1 },
      { id: 'mentor-2', max_capacity: 1 },
    ];
    assignments = [];
  });

  it('assigns the priority-1 mentor when they have capacity', () => {
    const preferences: Preference[] = [
      { idea_id: 'idea-1', priority: 1, mentor_profile_id: 'mentor-1' },
      { idea_id: 'idea-1', priority: 2, mentor_profile_id: 'mentor-2' },
    ];
    const { assignment, notifiedAdmins } = routeReviewer('idea-1', mentors, preferences, assignments);
    expect(assignment.status).toBe('pending');
    expect(assignment.mentor_profile_id).toBe('mentor-1');
    expect(notifiedAdmins).toBe(false);
  });

  it('falls back to the priority-2 mentor once priority-1 is full', () => {
    // Fill mentor-1's single slot with an unrelated idea first.
    assignments.push({ idea_id: 'other-idea', mentor_profile_id: 'mentor-1', status: 'pending' });
    const preferences: Preference[] = [
      { idea_id: 'idea-2', priority: 1, mentor_profile_id: 'mentor-1' },
      { idea_id: 'idea-2', priority: 2, mentor_profile_id: 'mentor-2' },
    ];
    const { assignment } = routeReviewer('idea-2', mentors, preferences, assignments);
    expect(assignment.status).toBe('pending');
    expect(assignment.mentor_profile_id).toBe('mentor-2');
  });

  it('marks routing_required and flags admin notification when both preferred mentors are full', () => {
    assignments.push({ idea_id: 'other-1', mentor_profile_id: 'mentor-1', status: 'pending' });
    assignments.push({ idea_id: 'other-2', mentor_profile_id: 'mentor-2', status: 'pending' });
    const preferences: Preference[] = [
      { idea_id: 'idea-3', priority: 1, mentor_profile_id: 'mentor-1' },
      { idea_id: 'idea-3', priority: 2, mentor_profile_id: 'mentor-2' },
    ];
    const { assignment, notifiedAdmins } = routeReviewer('idea-3', mentors, preferences, assignments);
    expect(assignment.status).toBe('routing_required');
    expect(assignment.mentor_profile_id).toBeNull();
    expect(notifiedAdmins).toBe(true);
  });
});
