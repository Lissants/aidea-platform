'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { StatusBadge } from '@/components/ui/status-badge';
import { saveScreeningDecision } from '@/lib/services/screening';
import type { ScreeningQueueRow } from '@/lib/services/screening';
import type { ScreeningDecisionValue } from '@/types/database';

export function ScreeningRow({ row }: { row: ScreeningQueueRow }) {
  const [decision, setDecision] = React.useState<ScreeningDecisionValue | null>(row.decision);
  const [reason, setReason] = React.useState(row.internal_reason ?? '');
  const [pending, setPending] = React.useState(false);

  const differs =
    decision !== null &&
    ((row.mentor_recommendation === 'recommend_pass' && decision === 'not_pass') ||
      (row.mentor_recommendation === 'recommend_not_pass' && decision === 'pass_to_qualifier'));

  async function handleSave() {
    if (!decision) return;
    setPending(true);
    const result = await saveScreeningDecision(row.idea_id, { decision, internal_reason: reason }, row.mentor_recommendation);
    setPending(false);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    toast.success('Screening decision saved');
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">{row.idea_title}</CardTitle>
          <p className="text-sm text-muted-foreground">{row.team_name}</p>
        </div>
        {row.published ? (
          <StatusBadge status="published" />
        ) : row.decision ? (
          <StatusBadge status="awaiting_publication" />
        ) : (
          <StatusBadge status="waiting_for_review" />
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-muted/50 p-3 text-sm">
          <p className="font-medium">
            Mentor recommendation:{' '}
            <Badge variant={row.mentor_recommendation === 'recommend_pass' ? 'success' : 'destructive'}>
              {row.mentor_recommendation === 'recommend_pass' ? 'Recommend Pass' : 'Recommend Not Pass'}
            </Badge>
          </p>
          <p className="mt-1 text-muted-foreground">{row.mentor_comment}</p>
          {row.mentor_name && <p className="mt-1 text-xs text-muted-foreground">— {row.mentor_name}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Screening decision</Label>
          <RadioGroup
            value={decision ?? undefined}
            onValueChange={(v) => setDecision(v as ScreeningDecisionValue)}
            disabled={row.published}
            className="flex flex-col gap-2 sm:flex-row sm:gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="pass_to_qualifier" id={`pass-${row.idea_id}`} disabled={row.published} />
              <Label htmlFor={`pass-${row.idea_id}`} className="cursor-pointer font-normal">
                Pass to Idea Qualifier
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="not_pass" id={`not-pass-${row.idea_id}`} disabled={row.published} />
              <Label htmlFor={`not-pass-${row.idea_id}`} className="cursor-pointer font-normal">
                Not Pass
              </Label>
            </div>
          </RadioGroup>
        </div>

        {differs && (
          <div className="space-y-1.5">
            <Label htmlFor={`reason-${row.idea_id}`}>
              Internal reason (required — differs from mentor recommendation)
            </Label>
            <Textarea
              id={`reason-${row.idea_id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={row.published}
              rows={3}
            />
          </div>
        )}

        {!row.published && (
          <Button size="sm" onClick={handleSave} disabled={pending || !decision || (differs && reason.trim().length < 5)}>
            {pending ? 'Saving…' : 'Save decision'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
