'use server';

import { attempt, db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';

export interface FunnelStage {
  stage: string;
  count: number;
}

export interface WorkloadRow {
  name: string;
  active: number;
  capacity: number;
}

export interface TurnoutPoint {
  idea_title: string;
  vote_count: number;
}

export interface WinnerCategoryRow {
  category: string;
  count: number;
}

/**
 * Every report here is program-wide aggregate data for the admin Reports
 * page. These are Server Actions (callable directly), so each one checks
 * for an admin session itself rather than relying on the page's layout.
 */
async function currentAdmin() {
  const user = await getCurrentUser();
  return user && isAdmin(user.roles) ? user : null;
}

/**
 * Submission funnel — each stage counts ideas that have reached at least
 * that far. Not mutually exclusive buckets on purpose: a funnel chart reads
 * as "how many made it this far", which needs the >= semantics below.
 */
export async function fetchSubmissionFunnel(programId: string): Promise<FunnelStage[]> {
  const admin = await currentAdmin();

  const counts = admin
    ? await db.queryOne<{ total: number; submitted: number; screened: number; qualified: number; showcased: number }>(
        `SELECT
           (SELECT COUNT(*) FROM ideas WHERE program_id = @programId) AS total,
           (SELECT COUNT(*) FROM ideas WHERE program_id = @programId AND status = 'submitted') AS submitted,
           (SELECT COUNT(*) FROM screening_decisions sd JOIN ideas i ON i.id = sd.idea_id
             WHERE i.program_id = @programId AND sd.published = 1) AS screened,
           (SELECT COUNT(*) FROM qualifier_assessments qa JOIN ideas i ON i.id = qa.idea_id
             WHERE i.program_id = @programId AND qa.published = 1 AND qa.build_decision = 'build') AS qualified,
           (SELECT COUNT(*) FROM showcase_projects WHERE program_id = @programId AND published = 1) AS showcased`,
        { programId }
      )
    : null;

  return [
    { stage: 'Draft/Total', count: counts?.total ?? 0 },
    { stage: 'Submitted', count: counts?.submitted ?? 0 },
    { stage: 'Screened', count: counts?.screened ?? 0 },
    { stage: 'Qualified (Build)', count: counts?.qualified ?? 0 },
    { stage: 'Showcased', count: counts?.showcased ?? 0 },
  ];
}

export async function fetchReviewerWorkload(programId: string): Promise<WorkloadRow[]> {
  if (!(await currentAdmin())) return [];

  const rows = await db.query<{ full_name: string | null; max_capacity: number; active: number }>(
    `SELECT p.full_name, mp.max_capacity,
            (SELECT COUNT(*) FROM review_assignments ra JOIN ideas i ON i.id = ra.idea_id
              WHERE ra.mentor_profile_id = mp.id AND ra.status = 'pending' AND i.program_id = @programId) AS active
       FROM mentor_profiles mp
       LEFT JOIN profiles p ON p.id = mp.profile_id`,
    { programId }
  );

  return rows.map((m) => ({
    name: m.full_name ?? 'Mentor',
    active: m.active ?? 0,
    capacity: m.max_capacity,
  }));
}

/** Latest voting period's per-idea turnout — admin-only (live counts come
 * through usp_vote_tallies' admin bypass). */
export async function fetchVotingTurnout(programId: string): Promise<TurnoutPoint[]> {
  const admin = await currentAdmin();
  if (!admin) return [];

  const period = await db.queryOne<{ id: string }>(
    'SELECT TOP (1) id FROM voting_periods WHERE program_id = @programId ORDER BY opens_at DESC',
    { programId }
  );

  if (!period) return [];

  const { data } = await attempt(() =>
    db.callProc<{ idea_title: string; vote_count: number }>('usp_vote_tallies', {
      voting_period_id: period.id,
      actor_id: admin.id,
    })
  );
  return (data ?? []).map((t) => ({ idea_title: t.idea_title, vote_count: Number(t.vote_count) }));
}

export async function fetchWinnerCategories(programId: string): Promise<WinnerCategoryRow[]> {
  const admin = await currentAdmin();

  const data = admin
    ? await db.query<{ winner_decision: string | null; winner_category: string | null }>(
        `SELECT winner_decision, winner_category FROM final_presentation_assessments
          WHERE program_id = @programId AND published = 1`,
        { programId }
      )
    : [];

  const counts = { grand_winner: 0, runner_up: 0, no_winner: 0 };
  for (const r of data) {
    if (r.winner_category === 'grand_winner') counts.grand_winner += 1;
    else if (r.winner_category === 'runner_up') counts.runner_up += 1;
    else if (r.winner_decision === 'no_winner') counts.no_winner += 1;
  }

  return [
    { category: 'Grand Winner', count: counts.grand_winner },
    { category: 'Runner-Up', count: counts.runner_up },
    { category: 'No Winner', count: counts.no_winner },
  ];
}
