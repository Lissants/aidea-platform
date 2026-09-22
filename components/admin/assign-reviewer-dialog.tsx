'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { MentorCapacityRow } from '@/lib/services/review-assignment';
import { assignReviewer } from '@/lib/services/review-assignment';

interface AssignReviewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  ideaId: string;
  currentMentorId: string | null;
  mentors: MentorCapacityRow[];
}

export function AssignReviewerDialog({
  open,
  onOpenChange,
  assignmentId,
  ideaId,
  currentMentorId,
  mentors,
}: AssignReviewerDialogProps) {
  const [selected, setSelected] = React.useState<string>(currentMentorId ?? '');
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const isChange = !!currentMentorId && selected !== currentMentorId;

  async function handleConfirm() {
    if (!selected) return;
    setPending(true);
    const result = await assignReviewer(assignmentId, ideaId, selected, {
      previousMentorProfileId: currentMentorId,
      reason,
    });
    setPending(false);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    toast.success(currentMentorId ? 'Reviewer changed' : 'Reviewer assigned');
    onOpenChange(false);
    setReason('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{currentMentorId ? 'Change reviewer' : 'Assign reviewer'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Mentor</Label>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {mentors.map((m) => {
                const atCapacity = m.active_count >= m.max_capacity;
                return (
                  <button
                    key={m.mentor_profile_id}
                    type="button"
                    onClick={() => setSelected(m.mentor_profile_id)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                      selected === m.mentor_profile_id ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
                    }`}
                  >
                    <span>{m.full_name}</span>
                    <span className={atCapacity ? 'text-destructive' : 'text-muted-foreground'}>
                      {m.active_count} of {m.max_capacity}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {isChange && (
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason for change (required)</Label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            The mentor will be notified immediately that an idea has been assigned to them for review.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={pending || !selected || (isChange && reason.trim().length < 5)}>
            {pending ? 'Saving…' : currentMentorId ? 'Confirm change' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
