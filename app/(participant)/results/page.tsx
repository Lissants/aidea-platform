import { Trophy } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Results' };

export default async function ResultsPage() {
  const supabase = await createClient();

  const { data: period } = await supabase
    .from('voting_periods')
    .select('*')
    .eq('results_published', true)
    .order('closes_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!period) {
    return (
      <div>
        <PageHeader title="Results" />
        <EmptyState icon={Trophy} title="Results aren't published yet" description="Voting results appear here once published." />
      </div>
    );
  }

  // Aggregate-only RPC — RLS on the base `votes` table only lets a voter see
  // their own ballot, so results must go through fn_vote_tallies rather
  // than querying `votes` directly (see 0008_views_and_helpers.sql).
  const { data: tallies } = await supabase.rpc('fn_vote_tallies', { p_voting_period_id: period.id });

  type Ranked = { idea_title: string; team_name: string; count: number };
  const ranked: Ranked[] = (tallies ?? [])
    .map((t: any) => ({ idea_title: t.idea_title, team_name: t.team_name, count: Number(t.vote_count) }))
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
