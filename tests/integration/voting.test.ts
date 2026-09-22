/**
 * Integration coverage for lib/services/voting.ts's castVote — real
 * service code (auth gating, Zod parsing, RPC call, error surfacing) run
 * against a fake `fn_submit_vote` RPC handler that encodes its documented
 * contract (supabase/migrations/0007_functions.sql): the voting window
 * must be open, a voter cannot vote for an idea their own team submitted,
 * and the unique(voting_period_id, voter_id) constraint allows exactly one
 * vote per voter per period. Verifying the actual SQL/constraint needs a
 * live Postgres/Supabase project (see ASSUMPTIONS.md).
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
      fn_submit_vote: (params, t) => {
        const period = (t.voting_periods ?? []).find((p) => p.id === params.p_voting_period_id);
        if (!period) return { error: { message: 'Voting period not found' } };
        const now = new Date();
        if (now < new Date(period.opens_at) || now > new Date(period.closes_at)) {
          return { error: { message: 'Voting is not currently open' } };
        }

        const isOwnTeam = (t.idea_team_members ?? []).some(
          (m) => m.idea_id === params.p_idea_id && m.profile_id === params.p_voter_id
        );
        if (isOwnTeam) {
          return { error: { message: 'You cannot vote for your own team\'s idea' } };
        }

        const alreadyVoted = (t.votes ?? []).some(
          (v) => v.voting_period_id === params.p_voting_period_id && v.voter_id === params.p_voter_id
        );
        if (alreadyVoted) {
          return { error: { message: 'You have already voted in this period' } };
        }

        (t.votes ?? (t.votes = [])).push({
          voting_period_id: params.p_voting_period_id,
          voter_id: params.p_voter_id,
          idea_id: params.p_idea_id,
        });
        return { data: null, error: null };
      },
    }),
}));

const { castVote } = await import('@/lib/services/voting');

const OPEN_PERIOD = {
  id: '11111111-1111-1111-1111-111111111111',
  opens_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  closes_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
};

beforeEach(() => {
  tables = { voting_periods: [{ ...OPEN_PERIOD }], votes: [], idea_team_members: [] };
  currentUser = { id: 'voter-1', roles: ['employee_voter'] };
});

describe('castVote', () => {
  const ideaId = '22222222-2222-2222-2222-222222222222';

  it('records a vote for an eligible voter', async () => {
    const result = await castVote({ voting_period_id: OPEN_PERIOD.id, idea_id: ideaId });
    expect('ok' in result && result.ok).toBe(true);
    expect(tables.votes).toHaveLength(1);
    expect(tables.votes[0]).toMatchObject({ voter_id: 'voter-1', idea_id: ideaId });
  });

  it('blocks a voter from voting for their own team\'s idea', async () => {
    tables.idea_team_members.push({ idea_id: ideaId, profile_id: 'voter-1' });
    const result = await castVote({ voting_period_id: OPEN_PERIOD.id, idea_id: ideaId });
    expect('error' in result).toBe(true);
    expect(tables.votes).toHaveLength(0);
  });

  it('blocks a second vote by the same voter in the same period', async () => {
    tables.votes.push({ voting_period_id: OPEN_PERIOD.id, voter_id: 'voter-1', idea_id: 'some-other-idea' });
    const result = await castVote({ voting_period_id: OPEN_PERIOD.id, idea_id: ideaId });
    expect('error' in result).toBe(true);
    // The original vote must be untouched — a vote cannot be changed by
    // simply casting another one.
    expect(tables.votes).toHaveLength(1);
    expect(tables.votes[0].idea_id).toBe('some-other-idea');
  });

  it('rejects when nobody is signed in', async () => {
    currentUser = null;
    const result = await castVote({ voting_period_id: OPEN_PERIOD.id, idea_id: ideaId });
    expect('error' in result).toBe(true);
  });

  it('rejects a malformed payload before ever calling the database', async () => {
    const result = await castVote({ voting_period_id: 'not-a-uuid', idea_id: ideaId });
    expect('error' in result).toBe(true);
    expect(tables.votes).toHaveLength(0);
  });
});
