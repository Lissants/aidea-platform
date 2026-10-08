/**
 * Integration coverage for lib/ideas/idea-draft.ts: a saved draft reloads
 * into the Submit New Idea form with every section intact, and only for its
 * creator while it is still a draft.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/auth/session';
import { SEED, closePool, db, resetTestDb, sessionUser } from './helpers/test-db';

let currentUser: SessionUser | null;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => currentUser }));

const { saveIdeaDraft, submitIdea } = await import('@/lib/services/ideas');
const { fetchEditableDraft } = await import('@/lib/ideas/idea-draft');

const participant1 = sessionUser(SEED.participant1, ['participant']);
// participant1 is already committed to an approved idea, so new drafts with a
// team are created by participant3 (not on any approved idea).
const participant3 = sessionUser(SEED.participant3, ['participant']);

beforeAll(resetTestDb);
afterAll(closePool);
beforeEach(() => {
  currentUser = participant1;
});

async function saveFullDraft() {
  currentUser = participant3;
  const result = await saveIdeaDraft(SEED.program, null, {
    team_name: 'Draft Team',
    idea_title: 'Forecast stock-outs',
    problem_opportunity: 'Warehouses run out of stock unpredictably.',
    proposed_solution: 'Use demand forecasting to flag shortages early.',
    target_users: 'Planners',
    team_leader_id: SEED.participant3,
    team_members: [{ profile_id: SEED.dev1, member_order: 1 }],
    impacts: [{ impact_kind: 'primary', impact_type: 'cost_optimization', explanation: 'Fewer rush orders', measurable_result: '' }],
    support_requests: [{ support_area: 'tools', details: 'Forecasting licence', reason: '', estimate: '' }],
    mentor_preferences: [
      { priority: 1, mentor_profile_id: SEED.mentorProfile1 },
      { priority: 2, mentor_profile_id: SEED.mentorProfile2 },
    ],
  } as any);
  if (!('ok' in result) || !result.ideaId) throw new Error('error' in result ? result.error : 'No idea id');
  return result.ideaId;
}

describe('fetchEditableDraft', () => {
  it('reloads every section of a saved draft', async () => {
    const id = await saveFullDraft();
    const draft = await fetchEditableDraft(id, SEED.participant3);

    expect(draft?.ideaId).toBe(id);
    expect(draft?.programId).toBe(SEED.program);
    expect(draft?.basics).toEqual({
      team_name: 'Draft Team',
      idea_title: 'Forecast stock-outs',
      problem_opportunity: 'Warehouses run out of stock unpredictably.',
      proposed_solution: 'Use demand forecasting to flag shortages early.',
      target_users: 'Planners',
    });
    expect(draft?.teamLeader?.profile_id).toBe(SEED.participant3);
    expect(draft?.teamLeader?.full_name).toBeTruthy();
    expect(draft?.teamMembers).toHaveLength(1);
    expect(draft?.teamMembers[0]).toMatchObject({ profile_id: SEED.dev1, member_order: 1 });
    expect(draft?.impacts).toEqual([
      { impact_kind: 'primary', impact_type: 'cost_optimization', explanation: 'Fewer rush orders', measurable_result: '' },
    ]);
    expect(draft?.supportRequests).toEqual([
      { support_area: 'tools', details: 'Forecasting licence', reason: '', estimate: '' },
    ]);
    expect(draft?.mentorPrefs).toEqual([
      { priority: 1, mentor_profile_id: SEED.mentorProfile1 },
      { priority: 2, mentor_profile_id: SEED.mentorProfile2 },
    ]);
  });

  it('adds an empty primary impact when none was saved', async () => {
    const draft = await fetchEditableDraft(SEED.draftIdea, SEED.participant1);
    expect(draft?.impacts[0]).toEqual({ impact_kind: 'primary', impact_type: '', explanation: '', measurable_result: '' });
  });

  it('saving again with the reloaded id updates the same draft', async () => {
    const id = await saveFullDraft();
    const result = await saveIdeaDraft(SEED.program, id, { idea_title: 'Forecast stock-outs v2' } as any);
    expect('ok' in result && result.ideaId).toBe(id);
    expect((await fetchEditableDraft(id, SEED.participant3))?.basics.idea_title).toBe('Forecast stock-outs v2');
  });

  it("returns null for someone else's draft", async () => {
    const id = await saveFullDraft();
    expect(await fetchEditableDraft(id, SEED.participant2)).toBeNull();
  });

  it('returns null once the idea is submitted', async () => {
    const id = await saveFullDraft();
    const submitted = await submitIdea(id);
    expect('ok' in submitted && submitted.ok).toBe(true);
    expect(await fetchEditableDraft(id, SEED.participant3)).toBeNull();
  });
});
