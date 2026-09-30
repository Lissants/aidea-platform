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
  results_published: boolean;
  results_published_at: string | null;
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
 * Live per-idea vote counts. Only reachable for an admin session — everyone
 * else is also blocked by usp_vote_tallies' own guard (results_published or
 * admin actor) even if they somehow called this. Voters must never see live
 * counts, only the published Results page.
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
 * Publish Favorite Project — the distinct publish step that makes the
 * participant-facing Results page show anything at all (it gates strictly
 * on results_published). Unlike the idea-keyed decision screens this isn't
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
                'The Favorite Project voting results are now live.', '/results'
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
  revalidatePath('/results');
  return { ok: true, count: result.data.count } as const;
}
