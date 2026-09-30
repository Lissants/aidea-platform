/**
 * Integration coverage for lib/services/ideas.ts against the real
 * aidea_test SQL Server database: auth gating, Zod parsing, draft
 * ownership/locking (formerly RLS "participants_crud_own_drafts", now
 * enforced in the service's WHERE clauses) and usp_submit_idea's
 * validation + reviewer routing.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/auth/session';
import { SEED, closePool, db, resetTestDb, sessionUser } from './helpers/test-db';

let currentUser: SessionUser | null;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => currentUser }));

const { saveIdeaDraft, submitIdea } = await import('@/lib/services/ideas');

const participant1 = sessionUser(SEED.participant1, ['participant']);
const participant2 = sessionUser(SEED.participant2, ['participant']);

const basics = {
  team_name: 'Team A',
  problem_opportunity: 'Warehouses run out of stock unpredictably.',
  proposed_solution: 'Use demand forecasting to flag shortages early.',
};

const ideaRow = (id: string) =>
  db.queryOne<{ idea_title: string; status: string; locked: boolean; created_by: string }>(
    'SELECT idea_title, status, locked, created_by FROM ideas WHERE id = @id',
    { id }
  );

beforeAll(resetTestDb);
afterAll(closePool);
beforeEach(() => {
  currentUser = participant1;
});

describe('saveIdeaDraft', () => {
  it('creates a new draft row owned by the current user', async () => {
    const result = await saveIdeaDraft(SEED.program, null, { idea_title: 'Smart bot', ...basics } as any);
    expect('ok' in result && result.ok).toBe(true);
    const row = await ideaRow((result as { ideaId: string }).ideaId);
    expect(row?.status).toBe('draft');
    expect(row?.created_by).toBe(SEED.participant1);
  });

  it('rejects when nobody is signed in', async () => {
    currentUser = null;
    const result = await saveIdeaDraft(SEED.program, null, { idea_title: 'x' } as any);
    expect('error' in result).toBe(true);
  });

  it('updating a draft succeeds while status is still draft', async () => {
    await saveIdeaDraft(SEED.program, SEED.draftIdea, { idea_title: 'New title', ...basics } as any);
    expect((await ideaRow(SEED.draftIdea))?.idea_title).toBe('New title');
  });

  it('does not modify a row once it has been submitted (locking)', async () => {
    await saveIdeaDraft(SEED.program, SEED.ideaDelta, { idea_title: 'Attempted edit', ...basics } as any);
    expect((await ideaRow(SEED.ideaDelta))?.idea_title).toBe('Demand Forecast Copilot');
  });

  it("does not let another participant edit someone else's draft", async () => {
    currentUser = participant2;
    await saveIdeaDraft(SEED.program, SEED.draftIdea, { idea_title: 'Hijacked', ...basics } as any);
    expect((await ideaRow(SEED.draftIdea))?.idea_title).not.toBe('Hijacked');
  });
});

describe('submitIdea', () => {
  it('refuses to submit an idea with no impacts', async () => {
    const result = await submitIdea(SEED.draftIdea);
    expect('error' in result && result.error).toMatch(/impact/i);
    expect((await ideaRow(SEED.draftIdea))?.status).toBe('draft');
  });

  it("refuses to submit someone else's idea", async () => {
    await db.insert('idea_impacts', { idea_id: SEED.draftIdea, impact_kind: 'primary', impact_type: 'cost_efficiency' });
    currentUser = participant2;
    const result = await submitIdea(SEED.draftIdea);
    expect('error' in result).toBe(true);
    expect((await ideaRow(SEED.draftIdea))?.status).toBe('draft');
  });

  it('submits, locks and routes a complete idea to its first-choice mentor', async () => {
    await db.insertMany('idea_mentor_preferences', [
      { idea_id: SEED.draftIdea, priority: 1, mentor_profile_id: SEED.mentorProfile2 },
      { idea_id: SEED.draftIdea, priority: 2, mentor_profile_id: SEED.mentorProfile1 },
    ]);
    const result = await submitIdea(SEED.draftIdea);
    expect('ok' in result && result.ok).toBe(true);

    const row = await ideaRow(SEED.draftIdea);
    expect(row?.status).toBe('submitted');
    expect(row?.locked).toBe(true);

    const assignment = await db.queryOne<{ status: string; mentor_profile_id: string }>(
      'SELECT status, mentor_profile_id FROM review_assignments WHERE idea_id = @id',
      { id: SEED.draftIdea }
    );
    expect(assignment).toEqual({ status: 'pending', mentor_profile_id: SEED.mentorProfile2 });
  });

  it('cannot submit the same idea twice', async () => {
    const result = await submitIdea(SEED.draftIdea);
    expect('error' in result && result.error).toMatch(/draft/i);
  });
});
