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

/** Radio option whose whole row (control + label) is one 44px tap target. */
function RadioOption({ value, id, label, disabled }: { value: string; id: string; label: string; disabled: boolean }) {
  return (
    <Label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 font-normal has-[[data-state=checked]]:border-foreground has-[[data-state=checked]]:font-semibold"
    >
      <RadioGroupItem value={value} id={id} disabled={disabled} />
      {label}
    </Label>
  );
}

function YesNo({
  name,
  label,
  value,
  onChange,
  disabled,
}: {
  name: string;
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  const labelId = `review-${name}-label`;
  return (
    <div className="space-y-2">
      <p id={labelId} className="text-sm font-semibold">
        {label}
      </p>
      <RadioGroup
        aria-labelledby={labelId}
        value={value === null ? undefined : value ? 'yes' : 'no'}
        onValueChange={(v) => onChange(v === 'yes')}
        className="grid grid-cols-2 gap-2 sm:flex"
      >
        <RadioOption value="yes" id={`review-${name}-yes`} label="Yes" disabled={disabled} />
        <RadioOption value="no" id={`review-${name}-no`} label="No" disabled={disabled} />
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

  // Listed next to the disabled Submit button so the mentor knows what is left.
  const missing = [
    desirability === null && 'Desirability',
    viability === null && 'Viability',
    realistic === null && 'Realistic implementation',
    recommendation === null && 'Recommendation',
    comment.trim().length < 10 && 'Comment (at least 10 characters)',
  ].filter(Boolean) as string[];
  const isComplete = missing.length === 0;

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
          <YesNo name="desirability" label="Desirability" value={desirability} onChange={setDesirability} disabled={isReadOnly} />
          <YesNo name="viability" label="Viability" value={viability} onChange={setViability} disabled={isReadOnly} />
          <YesNo
            name="realistic"
            label="Realistic implementation"
            value={realistic}
            onChange={setRealistic}
            disabled={isReadOnly}
          />

          <div className="space-y-2">
            <p id="review-recommendation-label" className="text-sm font-semibold">
              Recommendation
            </p>
            <RadioGroup
              aria-labelledby="review-recommendation-label"
              value={recommendation ?? undefined}
              onValueChange={(v) => setRecommendation(v as ReviewRecommendation)}
              className="grid gap-2 sm:flex"
            >
              <RadioOption value="recommend_pass" id="rec-pass" label="Recommend pass" disabled={isReadOnly} />
              <RadioOption value="recommend_not_pass" id="rec-not-pass" label="Recommend not pass" disabled={isReadOnly} />
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comment" className="font-semibold">
              Reviewer comment (required)
            </Label>
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
        <ContextualActionBar className="justify-between">
          <p id="review-submit-hint" className="text-sm text-muted-foreground">
            {isComplete ? 'Ready to submit.' : `To submit, complete: ${missing.join(', ')}.`}
          </p>
          <div className="flex flex-1 justify-end gap-2 sm:flex-none">
            <Button variant="secondary" onClick={handleSaveDraft} disabled={pending} className="flex-1 sm:flex-none">
              {pending ? 'Saving…' : 'Save draft'}
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={pending || !isComplete}
              aria-describedby="review-submit-hint"
              className="flex-1 sm:flex-none"
            >
              Submit review
            </Button>
          </div>
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
