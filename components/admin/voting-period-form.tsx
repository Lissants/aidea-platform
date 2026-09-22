'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { saveVotingPeriod } from '@/lib/services/voting-management';
import type { VotingPeriodRow } from '@/lib/services/voting-management';

function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Create-or-edit form for a single voting_periods row. Locked once
 * results_published — editing a published window would be misleading. */
export function VotingPeriodForm({ programId, period }: { programId: string; period: VotingPeriodRow | null }) {
  const [opensAt, setOpensAt] = React.useState(toLocalInput(period?.opens_at ?? null));
  const [closesAt, setClosesAt] = React.useState(toLocalInput(period?.closes_at ?? null));
  const [showPercentages, setShowPercentages] = React.useState(period?.show_percentages ?? true);
  const [pending, setPending] = React.useState(false);
  const locked = !!period?.results_published;

  async function handleSave() {
    if (!opensAt || !closesAt) {
      toast.error('Both opens-at and closes-at are required');
      return;
    }
    setPending(true);
    const result = await saveVotingPeriod(programId, {
      id: period?.id,
      opens_at: new Date(opensAt).toISOString(),
      closes_at: new Date(closesAt).toISOString(),
      show_percentages: showPercentages,
    });
    setPending(false);
    if ('error' in result) return toast.error(result.error);
    toast.success('Voting period saved');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{period ? 'Edit voting period' : 'Create voting period'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="opens-at">Opens at</Label>
            <Input id="opens-at" type="datetime-local" value={opensAt} disabled={locked} onChange={(e) => setOpensAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="closes-at">Closes at</Label>
            <Input id="closes-at" type="datetime-local" value={closesAt} disabled={locked} onChange={(e) => setClosesAt(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Show percentages on results</p>
            <p className="text-xs text-muted-foreground">Off shows raw vote counts instead once published.</p>
          </div>
          <Switch checked={showPercentages} disabled={locked} onCheckedChange={setShowPercentages} />
        </div>
        {locked ? (
          <p className="text-sm text-muted-foreground">Results are published — this voting period can no longer be edited.</p>
        ) : (
          <Button size="sm" onClick={handleSave} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
