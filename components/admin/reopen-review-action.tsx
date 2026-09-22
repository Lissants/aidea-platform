'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { reopenReview } from '@/lib/services/idea-management';

export function ReopenReviewAction({ reviewId, ideaId }: { reviewId: string; ideaId: string }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);

  async function handleReopen() {
    setPending(true);
    const result = await reopenReview(reviewId, ideaId, reason);
    setPending(false);
    if ('error' in result) return toast.error(result.error);
    toast.success('Review reopened — the reviewer has been notified');
    setOpen(false);
    setReason('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Reopen review
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen this review</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">A reason is required — the reviewer will see it.</p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why is this review being reopened?" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleReopen} disabled={pending || reason.trim().length === 0}>
            {pending ? 'Reopening…' : 'Reopen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
