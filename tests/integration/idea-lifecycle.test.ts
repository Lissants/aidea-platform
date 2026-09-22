/**
 * Integration coverage for lib/services/ideas.ts against the fake Supabase
 * client (see tests/integration/helpers/fake-supabase.ts). Exercises the
 * real service-layer code: auth gating, Zod parsing, and — for the
 * locking behavior — the same `.eq('status', 'draft')` guard the real
 * client sends, which is what RLS's `participants_crud_own_drafts` policy
 * (0099_rls.sql) actually enforces against a submitted row in production.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type Tables } from './helpers/fake-supabase';

let tables: Tables;
let currentUser: { id: string; roles: string[] } | null;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => currentUser }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    createFakeSupabase(tables, {
      fn_submit_idea: (params, t) => {
        const idea = (t.ideas ?? []).find((i) => i.id === params.p_idea_id);
        if (!idea) return { error: { message: 'Idea not found' } };
        if (!idea.idea_title || !idea.problem_opportunity) {
          return { error: { message: 'Idea is incomplete and cannot be submitted' } };
        }
        idea.status = 'submitted';
        idea.locked = true;
        idea.submitted_at = new Date().toISOString();
        return { data: null, error: null };
      },
    }),
}));

const { saveIdeaDraft, submitIdea } = await import('@/lib/services/ideas');

beforeEach(() => {
  tables = { ideas: [], idea_team_members: [], idea_impacts: [], idea_support_requests: [], idea_mentor_preferences: [] };
  currentUser = { id: 'user-1', roles: ['participant'] };
});

describe('saveIdeaDraft', () => {
  it('creates a new draft row owned by the current user', async () => {
    const result = await saveIdeaDraft('program-1', null, {
      idea_title: 'Smart bot',
      team_name: 'Team A',
      problem_opportunity: 'Warehouses run out of stock unpredictably.',
      proposed_solution: 'Use demand forecasting to flag shortages early.',
    } as any);

    expect('ok' in result && result.ok).toBe(true);
    expect(tables.ideas).toHaveLength(1);
    expect(tables.ideas[0].status).toBe('draft');
    expect(tables.ideas[0].created_by).toBe('user-1');
  });

  it('rejects when nobody is signed in', async () => {
    currentUser = null;
    const result = await saveIdeaDraft('program-1', null, { idea_title: 'x' } as any);
    expect('error' in result).toBe(true);
  });

  it('updating a draft succeeds while status is still draft', async () => {
    tables.ideas.push({ id: 'idea-1', status: 'draft', idea_title: 'Old title', created_by: 'user-1' });
    await saveIdeaDraft('program-1', 'idea-1', {
      idea_title: 'New title',
      team_name: 'Team A',
      problem_opportunity: 'Warehouses run out of stock unpredictably.',
      proposed_solution: 'Use demand forecasting to flag shortages early.',
    } as any);
    expect(tables.ideas[0].idea_title).toBe('New title');
  });

  it('does not modify a row once it has been submitted (locking)', async () => {
    tables.ideas.push({ id: 'idea-1', status: 'submitted', idea_title: 'Locked title', created_by: 'user-1', locked: true });
    await saveIdeaDraft('program-1', 'idea-1', {
      idea_title: 'Attempted edit',
      team_name: 'Team A',
      problem_opportunity: 'Warehouses run out of stock unpredictably.',
      proposed_solution: 'Use demand forecasting to flag shortages early.',
    } as any);
    // The real client's `.eq('status', 'draft')` filter (mirrored by the
    // fake client) means this update matches zero rows once submitted.
    expect(tables.ideas[0].idea_title).toBe('Locked title');
  });
});

describe('submitIdea', () => {
  it('submits and locks a complete idea', async () => {
    tables.ideas.push({ id: 'idea-1', status: 'draft', idea_title: 'Complete idea', problem_opportunity: 'p', created_by: 'user-1' });
    const result = await submitIdea('idea-1');
    expect('ok' in result && result.ok).toBe(true);
    expect(tables.ideas[0].status).toBe('submitted');
    expect(tables.ideas[0].locked).toBe(true);
  });

  it('refuses to submit an incomplete idea', async () => {
    tables.ideas.push({ id: 'idea-2', status: 'draft', idea_title: '', created_by: 'user-1' });
    const result = await submitIdea('idea-2');
    expect('error' in result).toBe(true);
    expect(tables.ideas[0].status).toBe('draft');
  });
});
