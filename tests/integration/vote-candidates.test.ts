/**
 * Favorite Project voting candidates against the real aidea_test database
 * (migrations 0011 + 0013):
 *  - an idea is a candidate once its screening Pass + qualifier Build are
 *    published — no final presentation row is needed;
 *  - final presentation / qualifier refuse ideas whose earlier stage isn't
 *    published;
 *  - publishVoting gates voters (usp_submit_vote refuses unpublished periods
 *    and non-candidates) and notifies every active profile;
 *  - published results are readable by non-admins only after publication.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/auth/session';
import { SEED, closePool, db, resetTestDb, sessionUser } from './helpers/test-db';

let currentUser: SessionUser | null;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => currentUser }));

const { fetchVoteCandidates, publishVoting, publishVotingResults } = await import('@/lib/services/voting-management');
const { saveFinalPresentationDraft, finalizeFinalPresentation } = await import('@/lib/services/final-presentation');
const { saveQualifierDraft } = await import('@/lib/services/qualifier');
const { castVote } = await import('@/lib/services/voting');

const admin = sessionUser(SEED.admin1, ['admin']);
const PERIOD = '99999999-9999-9999-9999-9999999990bb';

/** A submitted idea led by participant3, with the stage rows asked for. */
async function createIdea(
  title: string,
  stages: { screening?: 'published' | 'unpublished'; qualifier?: 'published' | 'unpublished'; finalPresentation?: boolean }
) {
  const id = randomUUID();
  await db.execute(
    `INSERT INTO ideas (id, program_id, team_name, team_leader_id, idea_title, problem_opportunity,
                        proposed_solution, status, locked, created_by)
     VALUES (@id, @program, @team, @leader, @title, N'Problem', N'Solution', 'submitted', 1, @leader)`,
    { id, program: SEED.program, team: `Team ${title}`, leader: SEED.participant3, title }
  );
  if (stages.screening) {
    await db.execute(
      `INSERT INTO screening_decisions (idea_id, decision, decided_at, published, published_at)
       VALUES (@id, 'pass_to_qualifier', SYSDATETIMEOFFSET(), @p, CASE WHEN @p = 1 THEN SYSDATETIMEOFFSET() END)`,
      { id, p: stages.screening === 'published' ? 1 : 0 }
    );
  }
  if (stages.qualifier) {
    await db.execute(
      `INSERT INTO qualifier_assessments (idea_id, final_score, overall_comment, build_decision, status, finalized_at,
                                          published, published_at)
       VALUES (@id, 80, N'Strong business case.', 'build', 'finalized', SYSDATETIMEOFFSET(), @p,
               CASE WHEN @p = 1 THEN SYSDATETIMEOFFSET() END)`,
      { id, p: stages.qualifier === 'published' ? 1 : 0 }
    );
  }
  if (stages.finalPresentation) {
    await db.execute("INSERT INTO final_presentation_assessments (idea_id, status) VALUES (@id, 'draft')", { id });
  }
  return id;
}

const candidateIds = async () => (await fetchVoteCandidates(SEED.program)).map((c) => c.idea_id);

let draftFp: string;
let buildNoFp: string;
let qualifierUnpublished: string;
let screeningUnpublished: string;

beforeAll(async () => {
  await resetTestDb();
  draftFp = await createIdea('Draft FP', { screening: 'published', qualifier: 'published', finalPresentation: true });
  buildNoFp = await createIdea('Build no FP', { screening: 'published', qualifier: 'published' });
  qualifierUnpublished = await createIdea('Qualifier unpublished', { screening: 'published', qualifier: 'unpublished' });
  screeningUnpublished = await createIdea('Screening unpublished', { screening: 'unpublished' });
  // A scheduled, not-yet-published period that is open by the clock.
  await db.execute(
    `INSERT INTO voting_periods (id, program_id, opens_at, closes_at, show_percentages)
     VALUES (@id, @program, DATEADD(hour, -1, SYSDATETIMEOFFSET()), DATEADD(day, 2, SYSDATETIMEOFFSET()), 1)`,
    { id: PERIOD, program: SEED.program }
  );
});
afterAll(closePool);
beforeEach(() => {
  currentUser = admin;
});

describe('voting candidates', () => {
  it('includes a published Build without a final presentation row', async () => {
    expect(await candidateIds()).toContain(buildNoFp);
  });

  it('includes a published Build with a final presentation, whatever its outcome', async () => {
    const result = await finalizeFinalPresentation(draftFp, {
      final_score: 55,
      overall_comment: 'Solid pitch, not a winner.',
      winner_decision: 'no_winner',
      winner_category: null,
    });
    expect(result).toEqual({ ok: true });
    expect(await candidateIds()).toContain(draftFp);
  });

  it('excludes a Build that is not published yet', async () => {
    expect(await candidateIds()).not.toContain(qualifierUnpublished);
  });

  it('never exposes score or decision to voters', async () => {
    currentUser = sessionUser(SEED.voter1, ['employee_voter']);
    const [first] = await fetchVoteCandidates(SEED.program);
    expect(Object.keys(first).sort()).toEqual(['idea_id', 'idea_title', 'team_name']);
  });
});

describe('stage gates', () => {
  it('refuses a final presentation for an unpublished qualifier Build', async () => {
    const result = await saveFinalPresentationDraft(qualifierUnpublished, {
      final_score: null,
      overall_comment: '',
      winner_decision: null,
      winner_category: null,
    });
    expect('error' in result && result.error).toMatch(/published qualifier/i);
    expect(await candidateIds()).not.toContain(qualifierUnpublished);
  });

  it('refuses a qualifier assessment for an unpublished screening Pass', async () => {
    const result = await saveQualifierDraft(screeningUnpublished, {
      final_score: null,
      overall_comment: '',
      build_decision: null,
    });
    expect('error' in result && result.error).toMatch(/published screening/i);
  });
});

describe('publishVoting', () => {
  it('blocks votes until the period is published', async () => {
    currentUser = sessionUser(SEED.voter2, ['employee_voter']);
    const result = await castVote({ voting_period_id: PERIOD, idea_id: draftFp });
    expect('error' in result && result.error).toMatch(/not currently open/i);
  });

  it('refuses a non-admin', async () => {
    currentUser = sessionUser(SEED.participant1, ['participant']);
    expect('error' in (await publishVoting(PERIOD, SEED.program))).toBe(true);
  });

  it('refuses when no idea has a published Build', async () => {
    const otherProgram = randomUUID();
    const otherPeriod = randomUUID();
    await db.execute(
      `INSERT INTO programs (id, title, status) VALUES (@id, N'Empty program', 'draft');
       INSERT INTO voting_periods (id, program_id, opens_at, closes_at)
       VALUES (@period, @id, SYSDATETIMEOFFSET(), DATEADD(day, 1, SYSDATETIMEOFFSET()))`,
      { id: otherProgram, period: otherPeriod }
    );
    const result = await publishVoting(otherPeriod, otherProgram);
    expect('error' in result && result.error).toMatch(/published Build/i);
  });

  it('publishes, notifies every active profile and writes a publication', async () => {
    const before = await db.queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE type = 'voting_opened'");
    const active = await db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM profiles WHERE active = 1');

    const result = await publishVoting(PERIOD, SEED.program);
    expect(result).toEqual({ ok: true, count: active!.n });

    const after = await db.queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE type = 'voting_opened'");
    expect(after!.n - before!.n).toBe(active!.n);
    const pub = await db.queryOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM publications WHERE entity_type = 'voting_period' AND entity_id = @id",
      { id: PERIOD }
    );
    expect(pub!.n).toBe(1);
  });

  it('refuses a second publish', async () => {
    expect('error' in (await publishVoting(PERIOD, SEED.program))).toBe(true);
  });
});

describe('casting votes once published', () => {
  it('accepts a vote for a candidate, then refuses a second vote', async () => {
    currentUser = sessionUser(SEED.voter2, ['employee_voter']);
    expect(await castVote({ voting_period_id: PERIOD, idea_id: draftFp })).toEqual({ ok: true });
    const again = await castVote({ voting_period_id: PERIOD, idea_id: buildNoFp });
    expect('error' in again).toBe(true);
  });

  it('refuses a vote for an idea that is not a candidate', async () => {
    currentUser = sessionUser(SEED.voter3, ['employee_voter']);
    const result = await castVote({ voting_period_id: PERIOD, idea_id: qualifierUnpublished });
    expect('error' in result && result.error).toMatch(/not a candidate/i);
  });

  it("refuses a vote for the voter's own team", async () => {
    currentUser = sessionUser(SEED.participant3, ['participant']);
    const result = await castVote({ voting_period_id: PERIOD, idea_id: draftFp });
    expect('error' in result && result.error).toMatch(/own team/i);
  });

  it('adds an idea whose Build result is published while voting is open', async () => {
    await db.execute(
      'UPDATE qualifier_assessments SET published = 1, published_at = SYSDATETIMEOFFSET() WHERE idea_id = @id',
      { id: qualifierUnpublished }
    );
    expect(await candidateIds()).toContain(qualifierUnpublished);

    currentUser = sessionUser(SEED.voter3, ['employee_voter']);
    expect(await castVote({ voting_period_id: PERIOD, idea_id: qualifierUnpublished })).toEqual({ ok: true });
  });
});

describe('results visibility', () => {
  const talliesAs = (user: SessionUser) =>
    db
      .callProc<{ idea_id: string; vote_count: number }>('usp_vote_tallies', { voting_period_id: PERIOD, actor_id: user.id })
      .then((rows) => ({ rows }))
      .catch((err: Error) => ({ error: err.message }));

  it('hides tallies from non-admins until results are published', async () => {
    expect(await talliesAs(sessionUser(SEED.voter1, ['employee_voter']))).toHaveProperty('error');
  });

  it('shows tallies to non-admins once results are published', async () => {
    await db.execute('UPDATE voting_periods SET closes_at = DATEADD(minute, -1, SYSDATETIMEOFFSET()) WHERE id = @id', {
      id: PERIOD,
    });
    expect(await publishVotingResults(PERIOD, SEED.program)).toMatchObject({ ok: true });
    const result = await talliesAs(sessionUser(SEED.voter1, ['employee_voter']));
    expect('rows' in result && result.rows.map((r) => r.idea_id).sort()).toEqual([draftFp, qualifierUnpublished].sort());
  });
});
