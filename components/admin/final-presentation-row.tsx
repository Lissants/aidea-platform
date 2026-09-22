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
import { saveFinalPresentationDraft, finalizeFinalPresentation } from '@/lib/services/final-presentation';
import type { FinalPresentationQueueRow } from '@/lib/services/final-presentation';
import type { WinnerCategory, WinnerDecision } from '@/types/database';

interface Props {
  row: FinalPresentationQueueRow;
  /** ideaId currently holding each category, program-wide (or null if unclaimed). */
  takenCategories: Record<WinnerCategory, string | null>;
}

export function FinalPresentationRow({ row, takenCategories }: Props) {
  const [score, setScore] = React.useState(row.final_score !== null ? String(row.final_score) : '');
  const [comment, setComment] = React.useState(row.overall_comment ?? '');
  const [winnerDecision, setWinnerDecision] = React.useState<WinnerDecision | null>(row.winner_decision);
  const [category, setCategory] = React.useState<WinnerCategory | null>(row.winner_category);
  const [pending, setPending] = React.useState<'draft' | 'finalize' | null>(null);

  const isLocked = row.published;
  const scoreNum = score.trim() === '' ? null : Number(score);
  const scoreValid = score.trim() === '' || (!Number.isNaN(scoreNum) && scoreNum! >= 0 && scoreNum! <= 100);

  function categoryTakenByOther(cat: WinnerCategory) {
    const holder = takenCategories[cat];
    return holder !== null && holder !== row.idea_id;
  }

  async function handleSaveDraft() {
    setPending('draft');
    const result = await saveFinalPresentationDraft(row.idea_id, {
      final_score: scoreValid ? scoreNum : null,
      overall_comment: comment,
      winner_decision: winnerDecision,
      winner_category: winnerDecision === 'winner' ? category : null,
    });
    setPending(null);
    if ('error' in result) return toast.error(result.error);
    toast.success('Draft saved');
  }

  async function handleFinalize() {
    if (scoreNum === null || !scoreValid || !winnerDecision) return;
    setPending('finalize');
    const result = await finalizeFinalPresentation(row.idea_id, {
      final_score: scoreNum,
      overall_comment: comment,
      winner_decision: winnerDecision,
      winner_category: winnerDecision === 'winner' ? category : null,
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
            <Label>Winner decision</Label>
            <RadioGroup
              value={winnerDecision ?? undefined}
              onValueChange={(v) => setWinnerDecision(v as WinnerDecision)}
              disabled={isLocked}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="winner" id={`winner-${row.idea_id}`} disabled={isLocked} />
                <Label htmlFor={`winner-${row.idea_id}`} className="cursor-pointer font-normal">
                  Winner
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="no_winner" id={`no-winner-${row.idea_id}`} disabled={isLocked} />
                <Label htmlFor={`no-winner-${row.idea_id}`} className="cursor-pointer font-normal">
                  No Winner
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        {winnerDecision === 'winner' && (
          <div className="space-y-1.5">
            <Label>Winner category</Label>
            <RadioGroup
              value={category ?? undefined}
              onValueChange={(v) => setCategory(v as WinnerCategory)}
              disabled={isLocked}
              className="flex flex-col gap-2 sm:flex-row sm:gap-4"
            >
              {(['grand_winner', 'runner_up'] as WinnerCategory[]).map((cat) => {
                const taken = categoryTakenByOther(cat);
                return (
                  <div key={cat} className="flex items-center gap-2">
                    <RadioGroupItem value={cat} id={`${cat}-${row.idea_id}`} disabled={isLocked || taken} />
                    <Label htmlFor={`${cat}-${row.idea_id}`} className="cursor-pointer font-normal">
                      {cat === 'grand_winner' ? 'Grand Winner' : 'Runner-Up'}
                      {taken && <span className="ml-1 text-xs text-destructive">(already assigned)</span>}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>
        )}

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
              disabled={
                pending !== null ||
                scoreNum === null ||
                !scoreValid ||
                !winnerDecision ||
                comment.trim().length < 10 ||
                (winnerDecision === 'winner' && !category)
              }
            >
              {pending === 'finalize' ? 'Finalizing…' : 'Finalize Assessment'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
