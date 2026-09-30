'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ContextualActionBar } from '@/components/layout/contextual-action-bar';
import { ConfirmDialog } from '@/components/layout/confirm-dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { saveReviewDraft, submitReview } from '@/lib/services/reviews';
import type { ReviewRecommendation } from '@/types/database';

interface ReviewFormProps {
  assignmentId: string;
  ideaId: string;
  initial: {
    desirability: boolean | null;
    viability: boolean | null;
    realistic_implementation: boolean | null;
    recommendation: ReviewRecommendation | null;
    comment: string | null;
  };
  reviewStatus: 'not_started' | 'draft' | 'submitted' | 'reopened';
  reopenReason: string | null;
}

function YesNo({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <RadioGroup
        value={value === null ? undefined : value ? 'yes' : 'no'}
        onValueChange={(v) => onChange(v === 'yes')}
        className="flex gap-4"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="yes" id={`${label}-yes`} disabled={disabled} />
          <Label htmlFor={`${label}-yes`} className="cursor-pointer font-normal">
            Yes
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="no" id={`${label}-no`} disabled={disabled} />
          <Label htmlFor={`${label}-no`} className="cursor-pointer font-normal">
            No
          </Label>
        </div>
      </RadioGroup>
    </div>
  );
}

export function ReviewForm({ assignmentId, ideaId, initial, reviewStatus, reopenReason }: ReviewFormProps) {
  const router = useRouter();
  const isReadOnly = reviewStatus === 'submitted';
  const [pending, setPending] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const [desirability, setDesirability] = React.useState<boolean | null>(initial.desirability);
  const [viability, setViability] = React.useState<boolean | null>(initial.viability);
  const [realistic, setRealistic] = React.useState<boolean | null>(initial.realistic_implementation);
  const [recommendation, setRecommendation] = React.useState<ReviewRecommendation | null>(initial.recommendation);
  const [comment, setComment] = React.useState(initial.comment ?? '');

  const isComplete =
    desirability !== null && viability !== null && realistic !== null && recommendation !== null && comment.trim().length >= 10;

  async function handleSaveDraft() {
    setPending(true);
    const result = await saveReviewDraft(assignmentId, ideaId, {
      desirability: desirability ?? undefined,
      viability: viability ?? undefined,
      realistic_implementation: realistic ?? undefined,
      recommendation: recommendation ?? undefined,
      comment,
    });
    setPending(false);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    toast.success('Draft saved');
    router.refresh();
  }

  async function handleSubmit() {
    if (!isComplete || desirability === null || viability === null || realistic === null || recommendation === null) return;
    setPending(true);
    const result = await submitReview(assignmentId, ideaId, {
      desirability,
      viability,
      realistic_implementation: realistic,
      recommendation,
      comment,
    });
    setPending(false);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    toast.success('Review submitted');
    router.push('/reviews');
  }

  return (
    <div className="space-y-4">
      {reviewStatus === 'reopened' && reopenReason && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>This review was reopened</AlertTitle>
          <AlertDescription>{reopenReason}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Your assessment</CardTitle>
          {isReadOnly && <StatusBadge status="review_completed" />}
        </CardHeader>
        <CardContent className="space-y-4">
          <YesNo label="Desirability" value={desirability} onChange={setDesirability} disabled={isReadOnly} />
          <YesNo label="Viability" value={viability} onChange={setViability} disabled={isReadOnly} />
          <YesNo label="Realistic implementation" value={realistic} onChange={setRealistic} disabled={isReadOnly} />

          <div className="space-y-1.5">
            <Label>Recommendation</Label>
            <RadioGroup
              value={recommendation ?? undefined}
              onValueChange={(v) => setRecommendation(v as ReviewRecommendation)}
              className="flex flex-col gap-2 sm:flex-row sm:gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="recommend_pass" id="rec-pass" disabled={isReadOnly} />
                <Label htmlFor="rec-pass" className="cursor-pointer font-normal">
                  Recommend Pass
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="recommend_not_pass" id="rec-not-pass" disabled={isReadOnly} />
                <Label htmlFor="rec-not-pass" className="cursor-pointer font-normal">
                  Recommend Not Pass
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comment">Reviewer comment (required)</Label>
            <Textarea
              id="comment"
              rows={5}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isReadOnly}
              placeholder="Explain your recommendation…"
            />
          </div>
        </CardContent>
      </Card>

      {!isReadOnly && (
        <ContextualActionBar>
          <Button variant="secondary" onClick={handleSaveDraft} disabled={pending}>
            Save as Draft
          </Button>
          <Button onClick={() => setConfirmOpen(true)} disabled={pending || !isComplete}>
            Submit Review
          </Button>
        </ContextualActionBar>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Submit this review?"
        description="Once submitted, this review becomes read-only. An admin can reopen it for you if changes are needed later."
        confirmLabel="Submit review"
        onConfirm={handleSubmit}
      />
    </div>
  );
}
