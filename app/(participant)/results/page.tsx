import { Trophy } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { attempt, db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata = { title: 'Results' };

export default async function ResultsPage() {
  const user = await getCurrentUser();

  const period = user
    ? await db.queryOne<{ id: string; show_percentages: boolean }>(
        'SELECT TOP (1) * FROM voting_periods WHERE results_published = 1 ORDER BY closes_at DESC'
      )
    : null;

  if (!user || !period) {
    return (
      <div>
        <PageHeader title="Results" />
        <EmptyState icon={Trophy} title="Results aren't published yet" description="Voting results appear here once published." />
      </div>
    );
  }

  // Aggregate-only procedure — a voter may only ever read their own ballot
  // from `votes`, so results must go through usp_vote_tallies rather than
  // querying `votes` directly. It throws for non-admins while results are
  // unpublished; treat that as no rows.
  const { data: tallies } = await attempt(() =>
    db.callProc<{ idea_title: string; team_name: string; vote_count: number }>('usp_vote_tallies', {
      voting_period_id: period.id,
      actor_id: user.id,
    })
  );

  type Ranked = { idea_title: string; team_name: string; count: number };
  const ranked: Ranked[] = (tallies ?? [])
    .map((t) => ({ idea_title: t.idea_title, team_name: t.team_name, count: Number(t.vote_count) }))
    .sort((a: Ranked, b: Ranked) => b.count - a.count);
  const totalVotes = ranked.reduce((sum: number, r: Ranked) => sum + r.count, 0);

  return (
    <div>
      <PageHeader title="Results" description="Voting results for the AI Innovation Challenge." action={<StatusBadge status="published" />} />
      <div className="space-y-3">
        {ranked.map((r: Ranked, idx: number) => (
          <Card key={r.idea_title + idx}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">
                  #{idx + 1} {r.idea_title}
                </p>
                <p className="text-sm text-muted-foreground">{r.team_name}</p>
              </div>
              <p className="text-sm font-semibold">
                {period.show_percentages && totalVotes > 0 ? `${Math.round((r.count / totalVotes) * 100)}%` : `${r.count} votes`}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
