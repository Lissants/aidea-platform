/**
 * usp_route_reviewer (db/migrations/0003_procedures.sql) against the real
 * aidea_test database: priority-1 mentor if they have capacity, else
 * priority-2, else routing_required + a notification for every admin. The
 * assigned mentor gets a "New review assigned" notification.
 *
 * Capacity counts only 'pending' assignments in the same program. Seeded
 * mentor profile 3 has max_capacity = 2 and no pending assignments; mentor
 * profile 1 has max_capacity = 10.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '@/lib/db/core';
import { SEED, closePool, db, resetTestDb } from './helpers/test-db';

beforeAll(resetTestDb);
afterAll(closePool);

async function ideaWithPreferences(prefs: string[]) {
  const id = newId();
  await db.insert('ideas', {
    id,
    program_id: SEED.program,
    team_name: `Team ${id.slice(0, 4)}`,
    team_leader_id: SEED.participant3,
    idea_title: `Routing test ${id.slice(0, 8)}`,
    problem_opportunity: 'p',
    proposed_solution: 's',
    status: 'submitted',
    created_by: SEED.participant3,
  });
  await db.insertMany(
    'idea_mentor_preferences',
    prefs.map((mentor_profile_id, i) => ({ idea_id: id, priority: i + 1, mentor_profile_id }))
  );
  return id;
}

async function route(ideaId: string) {
  await db.callProc('usp_route_reviewer', { idea_id: ideaId });
  return db.queryOne<{ status: string; mentor_profile_id: string | null }>(
    'SELECT status, mentor_profile_id FROM review_assignments WHERE idea_id = @ideaId',
    { ideaId }
  );
}

describe('usp_route_reviewer', () => {
  it('assigns the priority-1 mentor when they have capacity, and notifies them', async () => {
    const idea = await ideaWithPreferences([SEED.mentorProfile3, SEED.mentorProfile1]);
    expect(await route(idea)).toEqual({ status: 'pending', mentor_profile_id: SEED.mentorProfile3 });

    const note = await db.queryOne<{ body: string }>(
      "SELECT TOP (1) body FROM notifications WHERE user_id = @u AND type = 'reviewer_assigned' ORDER BY created_at DESC",
      { u: SEED.mentor3 }
    );
    expect(note?.body).toContain('Routing test');
  });

  it('falls back to the priority-2 mentor once priority-1 is full', async () => {
    // Fill mentor 3's second (last) slot.
    await route(await ideaWithPreferences([SEED.mentorProfile3]));
    const idea = await ideaWithPreferences([SEED.mentorProfile3, SEED.mentorProfile1]);
    expect(await route(idea)).toEqual({ status: 'pending', mentor_profile_id: SEED.mentorProfile1 });
  });

  it('marks routing_required and notifies every admin when all preferred mentors are full', async () => {
    const idea = await ideaWithPreferences([SEED.mentorProfile3]);
    const { since } = (await db.queryOne<{ since: string }>('SELECT SYSDATETIMEOFFSET() AS since'))!;
    expect(await route(idea)).toEqual({ status: 'routing_required', mentor_profile_id: null });

    const admins = await db.query<{ user_id: string }>(
      `SELECT DISTINCT n.user_id FROM notifications n
        WHERE n.type = 'routing_required' AND n.created_at >= @since`,
      { since }
    );
    expect(admins.map((a) => a.user_id).sort()).toEqual([
      '11111111-1111-1111-1111-111111111001',
      '11111111-1111-1111-1111-111111111002',
      '11111111-1111-1111-1111-111111111003',
    ]);
  });
});
