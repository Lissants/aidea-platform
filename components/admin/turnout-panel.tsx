'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/layout/confirm-dialog';
import { fetchLiveTurnout, publishVotingResults } from '@/lib/services/voting-management';
import type { VotingPeriodRow, TurnoutRow } from '@/lib/services/voting-management';

/**
 * Admin-only live turnout view. fn_vote_tallies (0010) lets an admin session
 * through even before results_published — no other role can ever see this.
 */
export function TurnoutPanel({ programId, period }: { programId: string; period: VotingPeriodRow }) {
  const [rows, setRows] = React.useState<TurnoutRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const closed = new Date(period.closes_at) <= new Date();

  const load = React.useCallback(async () => {
    setLoading(true);
    setRows(await fetchLiveTurnout(period.id));
    setLoading(false);
  }, [period.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const totalVotes = rows.reduce((sum, r) => sum + r.vote_count, 0);

  async function handlePublish() {
    const result = await publishVotingResults(period.id, programId);
    if ('error' in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Favorite Project results published');
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">Live turnout {period.results_published && <StatusBadge status="published" className="ml-2" />}</CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          {!period.results_published && (
            <Button size="sm" disabled={!closed} onClick={() => setConfirmOpen(true)}>
              Publish Favorite Project
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {!closed && !period.results_published && (
          <p className="text-sm text-muted-foreground">Voting is still open — results can be published once it closes.</p>
        )}
        <p className="text-sm text-muted-foreground">{totalVotes} total vote(s) cast so far.</p>
        {rows.map((r) => (
          <div key={r.idea_id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <div>
              <p className="font-medium">{r.idea_title}</p>
              <p className="text-xs text-muted-foreground">{r.team_name}</p>
            </div>
            <p className="font-semibold">{r.vote_count} vote(s)</p>
          </div>
        ))}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Publish Favorite Project"
        description="This publishes the Favorite Project voting results to every voter and cannot be undone."
        confirmLabel="Publish"
        destructive
        requiredConfirmationText="PUBLISH"
        onConfirm={handlePublish}
      />
    </Card>
  );
}
