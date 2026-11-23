/**
 * Participant idea detail (/my-ideas/[ideaId]) against the real aidea_test
 * database: only the creator, leader and team members can load an idea, and
 * results show only once published.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/auth/session';
import { newId } from '@/lib/db';
import { SEED, closePool, db, resetTestDb, sessionUser } from './helpers/test-db';

let currentUser: SessionUser | null = null;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => currentUser }));

const { submitIdeaDraft } = await import('@/lib/services/ideas');
const { fetchMyIdeaDetail } = await import('@/lib/ideas/my-ideas');

let seq = 0;
async function person(label: string) {
  const id = newId();
  const email = `mid.${label.toLowerCase()}.${++seq}.${id.slice(0, 8)}@test.local`;
  await db.insert('users', { id, email });
  await db.insert('profiles', { id, email, full_name: `Person ${label}${seq}`, active: true });
  return id;
}

let creator: string, leader: string, member: string, outsider: string, ideaId: string;

beforeAll(async () => {
  await resetTestDb();
  [creator, leader, member, outsider] = await Promise.all(['Creator', 'Leader', 'Member', 'Outsider'].map(person));

  currentUser = sessionUser(creator, ['participant']);
  const result = await submitIdeaDraft(SEED.program, null, {
    team_name: 'Team Detail',
    idea_title: 'Detail idea',
    problem_opportunity: 'Stock-outs every month.',
    proposed_solution: 'Forecast demand a week early.',
    target_users: 'Warehouse planners',
    team_leader_id: leader,
    team_members: [{ profile_id: member, member_order: 1 }],
    impacts: [
      { impact_kind: 'primary', impact_type: 'cost_optimization', explanation: 'Less freight.', measurable_result: '10% less' },
    ],
    support_requests: [],
    mentor_preferences: [],
  });
  if (!('ok' in result) || !result.ideaId) throw new Error(`submit failed: ${'error' in result ? result.error : ''}`);
  ideaId = result.ideaId;
});
afterAll(closePool);

describe('fetchMyIdeaDetail', () => {
  it('returns the full idea to the creator, leader and member, with their role', async () => {
    const byCreator = await fetchMyIdeaDetail(ideaId, creator);
    expect(byCreator).toMatchObject({
      idea_title: 'Detail idea',
      problem_opportunity: 'Stock-outs every month.',
      status: 'submitted',
      my_role: 'creator',
    });
    expect(byCreator?.team_members).toHaveLength(1);
    expect(byCreator?.impacts).toHaveLength(1);
    expect(byCreator?.team_leader).not.toBeNull();

    expect((await fetchMyIdeaDetail(ideaId, leader))?.my_role).toBe('leader');
    expect((await fetchMyIdeaDetail(ideaId, member))?.my_role).toBe('member');
  });

  it('returns null to anyone not on the idea, and for an unknown id', async () => {
    expect(await fetchMyIdeaDetail(ideaId, outsider)).toBeNull();
    expect(await fetchMyIdeaDetail(newId(), creator)).toBeNull();
  });

  it('hides results until they are published', async () => {
    await db.execute(
      `INSERT INTO screening_decisions (idea_id, decision, decided_by, decided_at)
       VALUES (@ideaId, 'pass_to_qualifier', @admin, SYSDATETIMEOFFSET())`,
      { ideaId, admin: SEED.admin1 }
    );
    await db.execute(
      `INSERT INTO qualifier_assessments (idea_id, final_score, overall_comment, build_decision, status, finalized_at)
       VALUES (@ideaId, 80, N'Strong case.', 'build', 'finalized', SYSDATETIMEOFFSET())`,
      { ideaId }
    );
    expect(await fetchMyIdeaDetail(ideaId, member)).toMatchObject({ screening: null, qualifier: null, mentor_name: null });

    await db.callProc('usp_publish_batch', { program_id: SEED.program, entity_type: 'screening_decision', actor_id: SEED.admin1 });
    expect(await fetchMyIdeaDetail(ideaId, member)).toMatchObject({ screening: 'pass_to_qualifier', qualifier: null });

    await db.callProc('usp_publish_batch', { program_id: SEED.program, entity_type: 'qualifier_assessment', actor_id: SEED.admin1 });
    expect(await fetchMyIdeaDetail(ideaId, member)).toMatchObject({ screening: 'pass_to_qualifier', qualifier: 'build' });
  });
});
