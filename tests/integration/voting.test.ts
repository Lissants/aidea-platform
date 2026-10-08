/**
 * Integration coverage for lib/services/voting.ts's castVote against the
 * real aidea_test database: usp_submit_vote's open-window, Build-candidate
 * and own-team checks, and uq_votes_period_voter's one-vote-per-period guarantee.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/auth/session';
import { SEED, closePool, db, resetTestDb, sessionUser } from './helpers/test-db';

let currentUser: SessionUser | null;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => currentUser }));

const { castVote } = await import('@/lib/services/voting');

const votesBy = (voterId: string) =>
  db.query<{ idea_id: string }>('SELECT idea_id FROM votes WHERE voting_period_id = @p AND voter_id = @v', {
    p: SEED.openPeriod,
    v: voterId,
  });

beforeAll(resetTestDb);
afterAll(closePool);
beforeEach(() => {
  currentUser = sessionUser(SEED.voter1, ['employee_voter']);
});

describe('castVote', () => {
  it('records a vote for an eligible voter', async () => {
    const result = await castVote({ voting_period_id: SEED.openPeriod, idea_id: SEED.ideaDelta });
    expect('ok' in result && result.ok).toBe(true);
    expect(await votesBy(SEED.voter1)).toEqual([{ idea_id: SEED.ideaDelta }]);
  });

  it('blocks a second vote by the same voter in the same period', async () => {
    const result = await castVote({ voting_period_id: SEED.openPeriod, idea_id: SEED.ideaDelta });
    expect('error' in result && result.error).toMatch(/already voted/i);
    // The original vote must be untouched — a vote cannot be changed by
    // simply casting another one.
    expect(await votesBy(SEED.voter1)).toEqual([{ idea_id: SEED.ideaDelta }]);
  });

  it("blocks a voter from voting for their own team's idea", async () => {
    currentUser = sessionUser(SEED.participant1, ['participant']); // team leader of Team Delta
    const result = await castVote({ voting_period_id: SEED.openPeriod, idea_id: SEED.ideaDelta });
    expect('error' in result && result.error).toMatch(/own team/i);
    expect(await votesBy(SEED.participant1)).toHaveLength(0);
  });

  it('rejects a vote for an idea that is not marked Build', async () => {
    currentUser = sessionUser(SEED.voter2, ['employee_voter']);
    const result = await castVote({ voting_period_id: SEED.openPeriod, idea_id: SEED.ideaBeacon });
    expect('error' in result && result.error).toMatch(/not a candidate/i);
    expect(await votesBy(SEED.voter2)).toHaveLength(0);
  });

  it('rejects votes outside the voting window', async () => {
    currentUser = sessionUser(SEED.voter2, ['employee_voter']);
    const result = await castVote({ voting_period_id: SEED.closedPublishedPeriod, idea_id: SEED.ideaBeacon });
    expect('error' in result && result.error).toMatch(/not currently open/i);
  });

  it('rejects when nobody is signed in', async () => {
    currentUser = null;
    const result = await castVote({ voting_period_id: SEED.openPeriod, idea_id: SEED.ideaDelta });
    expect('error' in result).toBe(true);
  });

  it('rejects a malformed payload before ever calling the database', async () => {
    currentUser = sessionUser(SEED.voter3, ['employee_voter']);
    const result = await castVote({ voting_period_id: 'not-a-uuid', idea_id: SEED.ideaDelta });
    expect('error' in result).toBe(true);
    expect(await votesBy(SEED.voter3)).toHaveLength(0);
  });
});
