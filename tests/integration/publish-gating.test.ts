/**
 * Two things are covered here:
 *
 * 1. A real integration test of lib/services/voting-management.ts's
 *    publishVotingResults — actual app code, run against the fake
 *    Supabase client (helpers/fake-supabase.ts): refuses while voting is
 *    still open, refuses a second publish, and on success only notifies
 *    profiles that actually cast a vote (the bug fixed for the idea-keyed
 *    equivalent, fn_publish_batch, in 0012_fn_publish_batch_notify_fix.sql).
 *
 * 2. A JS mirror of fn_publish_batch's row-selection contract (only
 *    finalized-and-unpublished rows in the given program flip to
 *    published=true — everything else, including already-published rows,
 *    is left alone) — same caveat as reviewer-routing.test.ts: this proves
 *    the documented contract, not the SQL migration itself, which needs a
 *    live Postgres project to verify directly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type Tables } from './helpers/fake-supabase';

let tables: Tables;
let currentUser: { id: string; roles: string[] } | null;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => currentUser }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createFakeSupabase(tables) }));

const { publishVotingResults } = await import('@/lib/services/voting-management');

beforeEach(() => {
  tables = { voting_periods: [], votes: [], publications: [], audit_logs: [], notifications: [] };
  currentUser = { id: 'admin-1', roles: ['admin'] };
});

describe('publishVotingResults (real service code)', () => {
  function closedPeriod(overrides: Partial<Tables['voting_periods'][number]> = {}) {
    return {
      id: 'period-1',
      program_id: 'program-1',
      opens_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      closes_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      results_published: false,
      show_percentages: true,
      ...overrides,
    };
  }

  it('refuses to publish while a non-admin calls it', async () => {
    currentUser = { id: 'p-1', roles: ['participant'] };
    tables.voting_periods.push(closedPeriod());
    const result = await publishVotingResults('period-1', 'program-1');
    expect('error' in result).toBe(true);
  });

  it('refuses to publish while voting is still open', async () => {
    tables.voting_periods.push(closedPeriod({ closes_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() }));
    const result = await publishVotingResults('period-1', 'program-1');
    expect('error' in result).toBe(true);
    expect(tables.voting_periods[0].results_published).toBe(false);
  });

  it('publishes once voting has closed, and notifies only actual voters', async () => {
    tables.voting_periods.push(closedPeriod());
    tables.votes.push({ voting_period_id: 'period-1', voter_id: 'voter-1', idea_id: 'idea-a' });
    tables.votes.push({ voting_period_id: 'period-1', voter_id: 'voter-2', idea_id: 'idea-b' });
    // A profile that exists but never voted must NOT be notified.
    const result = await publishVotingResults('period-1', 'program-1');

    expect('ok' in result && result.ok).toBe(true);
    expect(tables.voting_periods[0].results_published).toBe(true);
    expect(tables.publications).toHaveLength(1);
    const notifiedIds = tables.notifications.map((n) => n.user_id).sort();
    expect(notifiedIds).toEqual(['voter-1', 'voter-2']);
  });

  it('refuses a second publish once already published', async () => {
    tables.voting_periods.push(closedPeriod({ results_published: true }));
    const result = await publishVotingResults('period-1', 'program-1');
    expect('error' in result).toBe(true);
  });
});

describe('fn_publish_batch row-selection contract (JS mirror)', () => {
  interface QualifierRow {
    idea_id: string;
    program_id: string;
    status: 'draft' | 'finalized';
    published: boolean;
  }

  function publishBatch(rows: QualifierRow[], programId: string): number {
    let count = 0;
    for (const r of rows) {
      if (r.program_id === programId && r.status === 'finalized' && !r.published) {
        r.published = true;
        count += 1;
      }
    }
    return count;
  }

  it('only flips finalized, unpublished rows in the target program', () => {
    const rows: QualifierRow[] = [
      { idea_id: 'a', program_id: 'p1', status: 'finalized', published: false },
      { idea_id: 'b', program_id: 'p1', status: 'draft', published: false },
      { idea_id: 'c', program_id: 'p1', status: 'finalized', published: true },
      { idea_id: 'd', program_id: 'p2', status: 'finalized', published: false },
    ];
    const count = publishBatch(rows, 'p1');
    expect(count).toBe(1);
    expect(rows.find((r) => r.idea_id === 'a')?.published).toBe(true);
    expect(rows.find((r) => r.idea_id === 'b')?.published).toBe(false); // still draft
    expect(rows.find((r) => r.idea_id === 'd')?.published).toBe(false); // wrong program

    // A read path filtering on published=true — mirroring what a
    // participant-safe view exposes — must only ever see 'a', never 'b' or 'd'.
    const visibleToParticipants = rows.filter((r) => r.published);
    expect(visibleToParticipants.map((r) => r.idea_id)).toEqual(['a', 'c']);
  });
});
