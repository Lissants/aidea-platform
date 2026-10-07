'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import { logAudit } from '@/lib/audit/log';
import { votingPeriodSchema } from '@/lib/validation/schemas';

export interface VotingPeriodRow {
  id: string;
  program_id: string;
  opens_at: string;
  closes_at: string;
  show_percentages: boolean;
  voting_published: boolean;
  voting_published_at: string | null;
  results_published: boolean;
  results_published_at: string | null;
}

/** A voting candidate as voters see it — never the score, decision or category. */
export interface VoteCandidateRow {
  idea_id: string;
  idea_title: string;
  team_name: string;
  image_url: string | null;
  short_description: string | null;
}

export interface TurnoutRow {
  idea_id: string;
  idea_title: string;
  team_name: string;
  vote_count: number;
}

/** Voting periods for a program, newest first. Readable by any signed-in user. */
export async function fetchVotingPeriods(programId: string): Promise<VotingPeriodRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  return db.query<VotingPeriodRow>(
    'SELECT * FROM voting_periods WHERE program_id = @programId ORDER BY opens_at DESC',
    { programId }
  );
}

/**
 * Every idea in the final presentation stage (v_vote_candidates, migration
 * 0011), with its published showcase image/description when there is one.
 * Live: an idea that enters final presentation joins an open vote at once.
 * Readable by any signed-in user.
 */
export async function fetchVoteCandidates(programId: string): Promise<VoteCandidateRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await db.query<VoteCandidateRow>(
    `SELECT c.idea_id, i.idea_title, i.team_name,
            CASE WHEN sp.published = 1 THEN sp.image_url END AS image_url,
            CASE WHEN sp.published = 1 THEN sp.short_description END AS short_description
       FROM v_vote_candidates c
       JOIN ideas i ON i.id = c.idea_id
       LEFT JOIN showcase_projects sp ON sp.idea_id = c.idea_id
      WHERE c.program_id = @programId
      ORDER BY i.idea_title`,
    { programId }
  );
  return rows.map((r) => ({ ...r, idea_title: r.idea_title ?? 'Untitled', team_name: r.team_name ?? '' }));
}

/**
 * Live per-idea vote counts. Only reachable for an admin session — everyone
 * else is also blocked by usp_vote_tallies' own guard (results_published or
 * admin actor) even if they somehow called this. Voters must never see live
 * counts, only the published results at /voting/results.
 */
export async function fetchLiveTurnout(votingPeriodId: string): Promise<TurnoutRow[]> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return [];

  const { data } = await attempt(() =>
    db.callProc<TurnoutRow>('usp_vote_tallies', { voting_period_id: votingPeriodId, actor_id: user.id })
  );
  return (data ?? []).map((t) => ({
    idea_id: t.idea_id,
    idea_title: t.idea_title,
    team_name: t.team_name,
    vote_count: Number(t.vote_count),
  }));
}

/** Create or update a voting period. Saving is never publishing — it only
 * schedules/reschedules the window and the percentage-display toggle. */
export async function saveVotingPeriod(
  programId: string,
  input: { id?: string; opens_at: string; closes_at: string; show_percentages: boolean }
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const parsed = votingPeriodSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' } as const;

  const values = {
    opens_at: parsed.data.opens_at,
    closes_at: parsed.data.closes_at,
    show_percentages: parsed.data.show_percentages,
  };

  if (input.id) {
    const existing = await db.queryOne<{ results_published: boolean }>(
      'SELECT results_published FROM voting_periods WHERE id = @id',
      { id: input.id }
    );
    if (existing?.results_published) {
      return { error: 'This voting period is already published and can no longer be edited.' } as const;
    }
    // results_published = 0 in the WHERE closes the race with a concurrent publish.
    const { error } = await attempt(() =>
      db.update('voting_periods', values, 'id = @id AND results_published = 0', { id: input.id })
    );
    if (error) return { error } as const;
  } else {
    const { error } = await attempt(() => db.insert('voting_periods', { program_id: programId, ...values }));
    if (error) return { error } as const;
  }

  revalidatePath('/voting-management');
  revalidatePath('/voting');
  return { ok: true } as const;
}

/**
 * Publish voting — makes a scheduled voting period visible to voters (the
 * /voting page and usp_submit_vote both require voting_published). In one
 * transaction: sets voting_published/_at, writes a publications ledger row
 * and notifies every active user; opened_notified_at is set too so the cron
 * route doesn't announce the same period again. Then audits it.
 */
export async function publishVoting(votingPeriodId: string, programId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const period = await db.queryOne<VotingPeriodRow>(
    'SELECT * FROM voting_periods WHERE id = @votingPeriodId AND program_id = @programId',
    { votingPeriodId, programId }
  );
  if (!period) return { error: 'Voting period not found' } as const;
  if (period.voting_published) return { error: 'Voting is already published' } as const;
  if (period.results_published) return { error: 'Results for this voting period are already published' } as const;
  if (new Date(period.closes_at) <= new Date()) {
    return { error: 'This voting period has already closed — change its dates first.' } as const;
  }

  const candidates = await db.queryOne<{ n: number }>(
    'SELECT COUNT(*) AS n FROM v_vote_candidates WHERE program_id = @programId',
    { programId }
  );
  if (!candidates?.n) return { error: 'No ideas have reached final presentation yet — there is nothing to vote on.' } as const;

  const opensNow = new Date(period.opens_at) <= new Date();
  const body = opensNow
    ? 'You can now cast your Favorite Project vote.'
    : `Favorite Project voting opens ${new Date(period.opens_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.`;

  const publishedAt = new Date().toISOString();
  const result = await attempt(() =>
    db.transaction(async (tx) => {
      const updated = await tx.execute(
        `UPDATE voting_periods SET voting_published = 1, voting_published_at = @publishedAt,
                opened_notified_at = @publishedAt
          WHERE id = @votingPeriodId AND voting_published = 0`,
        { votingPeriodId, publishedAt }
      );
      if (updated === 0) return { alreadyPublished: true as const, count: 0 };

      await tx.insert('publications', {
        program_id: programId,
        entity_type: 'voting_period',
        entity_id: votingPeriodId,
        published_by: user.id,
        notes: 'Favorite Project voting published',
      });

      const count = await tx.execute(
        `INSERT INTO notifications (user_id, type, title, body, link)
         SELECT id, 'voting_opened', @title, @body, '/voting' FROM profiles WHERE active = 1`,
        { title: opensNow ? 'Voting is open' : 'Voting is scheduled', body }
      );
      return { alreadyPublished: false as const, count };
    })
  );
  if (result.error !== null) return { error: result.error } as const;
  if (result.data.alreadyPublished) return { error: 'Voting is already published' } as const;

  await logAudit({
    programId,
    entityType: 'voting_period',
    entityId: votingPeriodId,
    actorId: user.id,
    action: 'publish_voting',
    priorValue: { voting_published: false },
    newValue: { voting_published: true, voting_published_at: publishedAt },
  });

  revalidatePath('/voting-management');
  revalidatePath('/voting');
  return { ok: true, count: result.data.count } as const;
}

/**
 * Publish Favorite Project — the distinct publish step that makes
 * /voting/results show anything at all (it gates strictly on
 * results_published). Unlike the idea-keyed decision screens this isn't
 * a per-idea batch, so it's handled directly here rather than through
 * usp_publish_batch: sets results_published/_at, writes a publications
 * ledger row and notifies every voter who cast a ballot (one transaction),
 * then audits it.
 */
export async function publishVotingResults(votingPeriodId: string, programId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const period = await db.queryOne<VotingPeriodRow>('SELECT * FROM voting_periods WHERE id = @votingPeriodId', {
    votingPeriodId,
  });
  if (!period) return { error: 'Voting period not found' } as const;
  if (period.results_published) return { error: 'Results are already published' } as const;
  if (new Date(period.closes_at) > new Date()) {
    return { error: 'Voting has not closed yet — results cannot be published while voting is still open.' } as const;
  }

  const publishedAt = new Date().toISOString();
  const result = await attempt(() =>
    db.transaction(async (tx) => {
      const updated = await tx.execute(
        `UPDATE voting_periods SET results_published = 1, results_published_at = @publishedAt
          WHERE id = @votingPeriodId AND results_published = 0`,
        { votingPeriodId, publishedAt }
      );
      if (updated === 0) return { alreadyPublished: true as const, count: 0 };

      await tx.insert('publications', {
        program_id: programId,
        entity_type: 'voting_period',
        entity_id: votingPeriodId,
        published_by: user.id,
        notes: 'Favorite Project voting results published',
      });

      const count = await tx.execute(
        `INSERT INTO notifications (user_id, type, title, body, link)
         SELECT DISTINCT v.voter_id, 'voting_result_published', 'Favorite Project results are published',
                'The Favorite Project voting results are now live.', '/voting/results'
           FROM votes v
          WHERE v.voting_period_id = @votingPeriodId`,
        { votingPeriodId }
      );
      return { alreadyPublished: false as const, count };
    })
  );
  if (result.error !== null) return { error: result.error } as const;
  if (result.data.alreadyPublished) return { error: 'Results are already published' } as const;

  await logAudit({
    programId,
    entityType: 'voting_period',
    entityId: votingPeriodId,
    actorId: user.id,
    action: 'publish_voting_results',
    priorValue: { results_published: false },
    newValue: { results_published: true, results_published_at: publishedAt },
  });

  revalidatePath('/voting-management');
  revalidatePath('/voting/results');
  return { ok: true, count: result.data.count } as const;
}
