import { Trophy } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { attempt, db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata = { title: 'Voting results' };

/** Published Favorite Project results for the active program. usp_vote_tallies
 * refuses non-admins until results_published, so nothing leaks early. */
export default async function VotingResultsPage() {
  const user = await getCurrentUser();
  const period = await db.queryOne<{ id: string; show_percentages: boolean }>(
    `SELECT TOP (1) vp.id, vp.show_percentages
       FROM voting_periods vp
      WHERE vp.results_published = 1
        AND vp.program_id = (SELECT TOP (1) id FROM programs WHERE status = 'active' ORDER BY created_at DESC)
      ORDER BY vp.closes_at DESC`
  );

  const { data } =
    period && user
      ? await attempt(() =>
          db.callProc<{ idea_id: string; idea_title: string | null; team_name: string | null; vote_count: number }>(
            'usp_vote_tallies',
            { voting_period_id: period.id, actor_id: user.id }
          )
        )
      : { data: null };

  if (!period || !data) {
    return (
      <div>
        <PageHeader title="Voting results" />
        <EmptyState icon={Trophy} title="Results haven't been published yet" description="You'll get a notification once they are." />
      </div>
    );
  }

  const rows = data.map((r) => ({ ...r, vote_count: Number(r.vote_count) }));
  const total = rows.reduce((sum, r) => sum + r.vote_count, 0);
  const top = rows[0]?.vote_count ?? 0;

  return (
    <div>
      <PageHeader title="Voting results" description="Favorite Project vote, as published by the program team." action={<StatusBadge status="published" />} />
      {rows.length === 0 ? (
        <EmptyState icon={Trophy} title="No votes were cast" />
      ) : (
        <ol className="space-y-2" aria-label="Voting results">
          {rows.map((r) => {
            const share = total > 0 ? Math.round((r.vote_count / total) * 100) : 0;
            const leading = r.vote_count === top && top > 0;
            return (
              <li key={r.idea_id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    {leading && <Trophy className="h-4 w-4 shrink-0" aria-label="Most votes" />}
                    <div>
                      <p className="font-medium">{r.idea_title ?? 'Untitled'}</p>
                      <p className="text-xs text-muted-foreground">{r.team_name ?? ''}</p>
                    </div>
                  </div>
                  <p className="shrink-0 font-semibold">
                    {period.show_percentages ? `${share}%` : `${r.vote_count} vote(s)`}
                  </p>
                </div>
                {period.show_percentages && (
                  <div className="mt-2 h-1.5 rounded-full bg-muted" aria-hidden="true">
                    <div className="h-1.5 rounded-full bg-foreground" style={{ width: `${share}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
