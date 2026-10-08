/**
 * Publish gating against the real aidea_test database:
 *
 * 1. lib/services/voting-management.ts's publishVotingResults — refuses for
 *    non-admins, while voting is still open, and a second time; on success
 *    notifies only profiles that actually cast a vote.
 * 2. usp_publish_batch (via the qualifier service's publish action) only
 *    flips finalized, unpublished rows in the target program, and only
 *    notifies owners of the ideas in that batch.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/auth/session';
import { SEED, closePool, db, resetTestDb, sessionUser } from './helpers/test-db';

let currentUser: SessionUser | null;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => currentUser }));

const { publishVotingResults } = await import('@/lib/services/voting-management');

const admin = sessionUser(SEED.admin1, ['admin']);
const CLOSED_UNPUBLISHED = '99999999-9999-9999-9999-9999999990aa';

beforeAll(async () => {
  await resetTestDb();
  await db.execute(
    `INSERT INTO voting_periods (id, program_id, opens_at, closes_at, results_published, show_percentages)
     VALUES (@id, @program, DATEADD(day, -3, SYSDATETIMEOFFSET()), DATEADD(hour, -1, SYSDATETIMEOFFSET()), 0, 1)`,
    { id: CLOSED_UNPUBLISHED, program: SEED.program }
  );
  await db.insertMany('votes', [
    { voting_period_id: CLOSED_UNPUBLISHED, voter_id: SEED.voter1, idea_id: SEED.ideaDelta },
    { voting_period_id: CLOSED_UNPUBLISHED, voter_id: SEED.voter2, idea_id: SEED.ideaBeacon },
  ]);
});
afterAll(closePool);
beforeEach(() => {
  currentUser = admin;
});

const periodPublished = async (id: string) =>
  (await db.queryOne<{ results_published: boolean }>('SELECT results_published FROM voting_periods WHERE id = @id', { id }))
    ?.results_published;

describe('publishVotingResults', () => {
  it('refuses when a non-admin calls it', async () => {
    currentUser = sessionUser(SEED.participant1, ['participant']);
    const result = await publishVotingResults(CLOSED_UNPUBLISHED, SEED.program);
    expect('error' in result).toBe(true);
    expect(await periodPublished(CLOSED_UNPUBLISHED)).toBe(false);
  });

  it('refuses to publish while voting is still open', async () => {
    const result = await publishVotingResults(SEED.openPeriod, SEED.program);
    expect('error' in result).toBe(true);
    expect(await periodPublished(SEED.openPeriod)).toBe(false);
  });

  it('publishes once voting has closed, and notifies only actual voters', async () => {
    const before = await db.queryOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM notifications WHERE user_id NOT IN (@voters) AND created_at > DATEADD(minute, -5, SYSDATETIMEOFFSET())",
      { voters: [SEED.voter1, SEED.voter2] }
    );
    const result = await publishVotingResults(CLOSED_UNPUBLISHED, SEED.program);
    expect(result).toMatchObject({ ok: true, count: 2 });
    expect(await periodPublished(CLOSED_UNPUBLISHED)).toBe(true);

    const notified = await db.query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM notifications
        WHERE user_id IN (@everyone) AND created_at > DATEADD(minute, -5, SYSDATETIMEOFFSET())`,
      { everyone: [SEED.voter1, SEED.voter2, SEED.voter3] }
    );
    expect(notified.map((n) => n.user_id).sort()).toEqual([SEED.voter1, SEED.voter2]);
    const after = await db.queryOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM notifications WHERE user_id NOT IN (@voters) AND created_at > DATEADD(minute, -5, SYSDATETIMEOFFSET())",
      { voters: [SEED.voter1, SEED.voter2] }
    );
    expect(after?.n).toBe(before?.n);
  });

  it('refuses a second publish once already published', async () => {
    const result = await publishVotingResults(CLOSED_UNPUBLISHED, SEED.program);
    expect('error' in result).toBe(true);
  });
});

describe('usp_publish_batch row selection', () => {
  it('only flips finalized, unpublished rows in the target program and notifies just those owners', async () => {
    // Seed: ideaDelta's qualifier row is already published; ideaBeacon's is
    // finalized + unpublished. Add a draft (unfinalized) row that must stay put.
    await db.insert('qualifier_assessments', { idea_id: SEED.draftIdea, status: 'draft', build_decision: 'build' });

    const rows = await db.callProc<{ published_count: number }>('usp_publish_batch', {
      program_id: SEED.program,
      entity_type: 'qualifier_assessment',
      actor_id: SEED.admin1,
    });
    expect(rows[0].published_count).toBe(1);

    const state = await db.query<{ idea_id: string; published: boolean }>(
      'SELECT idea_id, published FROM qualifier_assessments'
    );
    expect(state.sort((a, b) => a.idea_id.localeCompare(b.idea_id))).toEqual([
      { idea_id: SEED.draftIdea, published: false },
      { idea_id: SEED.ideaBeacon, published: true },
      { idea_id: SEED.ideaDelta, published: true },
    ]);

    // ideaBeacon is a no_build: published, but the team is not notified.
    const notified = await db.query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM notifications WHERE type IN ('published', 'idea_qualifier_build')`
    );
    expect(notified).toEqual([]);
  });

  it('refuses a non-admin actor', async () => {
    await expect(
      db.callProc('usp_publish_batch', { program_id: SEED.program, entity_type: 'qualifier_assessment', actor_id: SEED.participant1 })
    ).rejects.toThrow(/only an admin/i);
  });
});

describe('usp_publish_batch result notifications', () => {
  const IDEA_COMET = '77777777-7777-7777-7777-777777777003'; // leader participant3
  const IDEA_ECHO = '77777777-7777-7777-7777-777777777005'; // leader participant2

  const notificationsOf = (type: string) =>
    db.query<{ user_id: string; body: string }>(
      'SELECT user_id, body FROM notifications WHERE type = @type ORDER BY user_id',
      { type }
    );

  beforeAll(async () => {
    await resetTestDb();
    // Comet: leader participant3 + member participant1. Echo's not_pass is already seeded (unpublished).
    await db.insert('idea_team_members', { idea_id: IDEA_COMET, profile_id: SEED.participant1, member_order: 1 });
    await db.insert('screening_decisions', {
      idea_id: IDEA_COMET,
      decision: 'pass_to_qualifier',
      decided_by: SEED.admin1,
      decided_at: new Date(),
    });
  });

  it('screening: Pass notifies creator and team members once each; Not Pass notifies nobody', async () => {
    await db.callProc('usp_publish_batch', { program_id: SEED.program, entity_type: 'screening_decision', actor_id: SEED.admin1 });

    const passed = await notificationsOf('idea_screening_passed');
    expect(passed.map((n) => n.user_id).sort()).toEqual([SEED.participant1, SEED.participant3].sort());

    const echo = await db.queryOne<{ published: boolean }>('SELECT published FROM screening_decisions WHERE idea_id = @id', { id: IDEA_ECHO });
    expect(echo?.published).toBe(true);
    expect(passed.some((n) => n.user_id === SEED.participant2)).toBe(false);
  });

  it('mentor assignment: notifies the team with the mentor name', async () => {
    await db.insert('project_mentor_assignments', {
      idea_id: IDEA_COMET,
      mentor_profile_id: SEED.mentorProfile1,
      assigned_by: SEED.admin1,
    });
    await db.callProc('usp_publish_batch', { program_id: SEED.program, entity_type: 'project_mentor_assignment', actor_id: SEED.admin1 });

    const mentor = await db.queryOne<{ full_name: string }>('SELECT full_name FROM profiles WHERE id = @id', { id: SEED.mentor1 });
    const rows = await notificationsOf('idea_mentor_assigned');
    expect(rows.map((n) => n.user_id).sort()).toEqual([SEED.participant1, SEED.participant3].sort());
    expect(rows[0].body).toContain(mentor!.full_name);
  });

  it('qualifier: Build notifies the team', async () => {
    await db.execute("UPDATE qualifier_assessments SET published = 0, published_at = NULL WHERE idea_id = @id", { id: SEED.ideaDelta });
    await db.callProc('usp_publish_batch', { program_id: SEED.program, entity_type: 'qualifier_assessment', actor_id: SEED.admin1 });
    const rows = await notificationsOf('idea_qualifier_build');
    expect(rows.map((n) => n.user_id)).toEqual([SEED.participant1]);
  });
});
