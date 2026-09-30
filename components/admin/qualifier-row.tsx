'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { saveQualifierDraft, finalizeQualifier } from '@/lib/services/qualifier';
import type { QualifierQueueRow } from '@/lib/services/qualifier';
import type { BuildDecision } from '@/types/database';

export function QualifierRow({ row }: { row: QualifierQueueRow }) {
  const [score, setScore] = React.useState<string>(row.final_score !== null ? String(row.final_score) : '');
  const [comment, setComment] = React.useState(row.overall_comment ?? '');
  const [buildDecision, setBuildDecision] = React.useState<BuildDecision | null>(row.build_decision);
  const [pending, setPending] = React.useState<'draft' | 'finalize' | null>(null);

  const isLocked = row.published;
  const scoreNum = score.trim() === '' ? null : Number(score);
  const scoreValid = score.trim() === '' || (!Number.isNaN(scoreNum) && scoreNum! >= 0 && scoreNum! <= 100);

  async function handleSaveDraft() {
    setPending('draft');
    const result = await saveQualifierDraft(row.idea_id, {
      final_score: scoreValid ? scoreNum : null,
      overall_comment: comment,
      build_decision: buildDecision,
    });
    setPending(null);
    if ('error' in result) return toast.error(result.error);
    toast.success('Draft saved');
  }

  async function handleFinalize() {
    if (scoreNum === null || !scoreValid || !buildDecision) return;
    setPending('finalize');
    const result = await finalizeQualifier(row.idea_id, {
      final_score: scoreNum,
      overall_comment: comment,
      build_decision: buildDecision,
    });
    setPending(null);
    if ('error' in result) return toast.error(result.error);
    toast.success('Assessment finalized');
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
        ) : row.status === 'finalized' ? (
          <StatusBadge status="awaiting_publication" />
        ) : (
          <StatusBadge status="draft" />
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`score-${row.idea_id}`}>Final score (0–100, decimals allowed)</Label>
            <Input
              id={`score-${row.idea_id}`}
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              disabled={isLocked}
            />
            {!scoreValid && <p className="text-xs text-destructive">Enter a number between 0 and 100.</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Build decision</Label>
            <RadioGroup
              value={buildDecision ?? undefined}
              onValueChange={(v) => setBuildDecision(v as BuildDecision)}
              disabled={isLocked}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="build" id={`build-${row.idea_id}`} disabled={isLocked} />
                <Label htmlFor={`build-${row.idea_id}`} className="cursor-pointer font-normal">
                  Build
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="no_build" id={`no-build-${row.idea_id}`} disabled={isLocked} />
                <Label htmlFor={`no-build-${row.idea_id}`} className="cursor-pointer font-normal">
                  No Build
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`comment-${row.idea_id}`}>Overall comment (required to finalize)</Label>
          <Textarea id={`comment-${row.idea_id}`} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} disabled={isLocked} />
        </div>

        {!isLocked && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={handleSaveDraft} disabled={pending !== null || !scoreValid}>
              {pending === 'draft' ? 'Saving…' : 'Save Draft'}
            </Button>
            <Button
              size="sm"
              onClick={handleFinalize}
              disabled={pending !== null || scoreNum === null || !scoreValid || !buildDecision || comment.trim().length < 10}
            >
              {pending === 'finalize' ? 'Finalizing…' : 'Finalize Assessment'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
