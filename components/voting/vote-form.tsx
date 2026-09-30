'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { castVote } from '@/lib/services/voting';

interface Candidate {
  idea_id: string;
  idea_title: string;
  team_name: string;
}

export function VoteForm({ votingPeriodId, candidates, alreadyVotedIdeaId }: {
  votingPeriodId: string;
  candidates: Candidate[];
  alreadyVotedIdeaId?: string | null;
}) {
  const [selected, setSelected] = React.useState<string | undefined>(alreadyVotedIdeaId ?? undefined);
  const [pending, setPending] = React.useState(false);
  const alreadyVoted = !!alreadyVotedIdeaId;

  async function onSubmit() {
    if (!selected) return;
    setPending(true);
    const result = await castVote({ voting_period_id: votingPeriodId, idea_id: selected });
    setPending(false);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    toast.success('Vote cast — thank you!');
  }

  return (
    <div className="space-y-4">
      <RadioGroup value={selected} onValueChange={setSelected} disabled={alreadyVoted}>
        {candidates.map((c) => (
          <div key={c.idea_id} className="flex items-center gap-3 rounded-md border p-3">
            <RadioGroupItem value={c.idea_id} id={c.idea_id} />
            <Label htmlFor={c.idea_id} className="flex-1 cursor-pointer">
              <span className="font-medium">{c.idea_title}</span>
              <span className="ml-2 text-sm text-muted-foreground">{c.team_name}</span>
            </Label>
          </div>
        ))}
      </RadioGroup>
      <Button onClick={onSubmit} disabled={!selected || pending || alreadyVoted}>
        {alreadyVoted ? 'Vote already cast' : pending ? 'Submitting…' : 'Cast vote'}
      </Button>
    </div>
  );
}
