'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Rocket } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/layout/confirm-dialog';

interface PublishReadinessBarProps {
  readyCount: number;
  totalCount: number;
  label: string;
  publishLabel?: string;
  onPublish: () => Promise<{ ok?: boolean; error?: string; count?: number }>;
}

/**
 * Shared "N of M ready, publish?" bar for every admin decision screen.
 * Publish is deliberately a separate, explicit, confirmed batch action —
 * never triggered implicitly by Save/Finalize.
 */
export function PublishReadinessBar({ readyCount, totalCount, label, publishLabel = 'Publish', onPublish }: PublishReadinessBarProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const canPublish = totalCount > 0 && readyCount > 0;
  const pct = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;

  async function handlePublish() {
    const result = await onPublish();
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Published ${result.count ?? readyCount} record(s)`);
  }

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1 space-y-1.5">
        <p className="text-sm font-medium">
          {readyCount} of {totalCount} {label} ready to publish
        </p>
        <Progress value={pct} className="max-w-sm" />
      </div>
      <Button onClick={() => setConfirmOpen(true)} disabled={!canPublish} className="shrink-0">
        <Rocket className="h-4 w-4" />
        {publishLabel}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={publishLabel}
        description={`This publishes ${readyCount} record(s) to participants and mentors and notifies them. This cannot be undone.`}
        confirmLabel="Publish"
        destructive
        requiredConfirmationText="PUBLISH"
        onConfirm={handlePublish}
      />
    </div>
  );
}
