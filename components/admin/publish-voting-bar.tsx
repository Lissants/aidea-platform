'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/layout/confirm-dialog';
import { publishVoting } from '@/lib/services/voting-management';
import type { VotingPeriodRow } from '@/lib/services/voting-management';

/**
 * The explicit "Publish voting" step: until it runs, a saved voting period is
 * invisible to voters. Publishing notifies every active user.
 */
export function PublishVotingBar({
  programId,
  period,
  candidateCount,
}: {
  programId: string;
  period: VotingPeriodRow | null;
  candidateCount: number;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  if (period?.voting_published) {
    const now = new Date();
    const status =
      new Date(period.closes_at) <= now ? 'voting_closed' : new Date(period.opens_at) > now ? 'voting_scheduled' : 'voting_open';
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <StatusBadge status={status} />
        <p className="text-sm text-muted-foreground">Voting is published to every employee.</p>
      </div>
    );
  }

  const closed = !!period && new Date(period.closes_at) <= new Date();
  const reason = !period
    ? 'Save a voting period first.'
    : closed
      ? 'This voting period has already closed — change its dates first.'
      : candidateCount === 0
        ? 'No ideas have a published Build result yet.'
        : `${candidateCount} candidate(s) will be on the ballot. Every active user is notified.`;

  async function handlePublish() {
    if (!period) return;
    const result = await publishVoting(period.id, programId);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`Voting published — ${result.count} user(s) notified`);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="text-sm font-medium">Voting is not published yet</p>
        <p className="text-sm text-muted-foreground">{reason}</p>
      </div>
      <Button
        onClick={() => setConfirmOpen(true)}
        disabled={!period || closed || candidateCount === 0}
        className="shrink-0"
      >
        <Rocket className="h-4 w-4" />
        Publish voting
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Publish voting"
        description="This opens Favorite Project voting to every employee for the saved window and notifies them. This cannot be undone."
        confirmLabel="Publish"
        destructive
        requiredConfirmationText="PUBLISH"
        onConfirm={handlePublish}
      />
    </div>
  );
}
