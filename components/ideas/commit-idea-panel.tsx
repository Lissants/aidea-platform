'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/layout/confirm-dialog';
import { commitToIdea, type ConflictIdea } from '@/lib/services/team-membership';

/**
 * Shown once one of the participant's ideas is marked Build while they are
 * still on other in-progress ideas in the same program. They commit to a Build
 * idea; committing drops them from the others, so the confirmation spells out
 * exactly what they leave and needs the team name typed.
 */
export function CommitIdeaPanel({ conflicts }: { conflicts: ConflictIdea[] }) {
  const router = useRouter();
  const [chosen, setChosen] = React.useState<ConflictIdea | null>(null);

  if (conflicts.length === 0) return null;

  const leaving = chosen
    ? conflicts.filter((c) => c.program_id === chosen.program_id && c.idea_id !== chosen.idea_id)
    : [];
  const leavingAsLeader = leaving.filter((c) => c.my_role === 'leader');
  const buildCount = conflicts.filter((c) => c.is_build).length;

  async function handleConfirm() {
    if (!chosen) return;
    const result = await commitToIdea(chosen.idea_id);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`You are now committed to "${chosen.idea_title}"`);
    router.refresh();
  }

  return (
    <Alert variant="warning" className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Choose the idea you will commit to</AlertTitle>
      <AlertDescription>
        <p className="mb-3">
          {buildCount === 1 ? 'Your idea was' : `${buildCount} of your ideas were`} selected to Build. From this stage
          each person can be on only one team. Commit to the Build idea you will continue with; you will be removed from
          your other ideas still in progress.
        </p>
        <div className="space-y-2">
          {conflicts.map((c) => (
            <div
              key={c.idea_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{c.idea_title}</p>
                <p className="text-xs text-muted-foreground">
                  {c.team_name} · you are {c.my_role === 'leader' ? 'team leader' : 'a team member'}
                </p>
                {c.team.length > 0 && <p className="text-xs text-muted-foreground">Team: {c.team.join(', ')}</p>}
              </div>
              {c.is_build ? (
                <Button size="sm" variant="outline" onClick={() => setChosen(c)}>
                  Commit to this idea
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Not Build · still in progress</span>
              )}
            </div>
          ))}
        </div>
      </AlertDescription>

      <ConfirmDialog
        open={!!chosen}
        onOpenChange={(open) => !open && setChosen(null)}
        title={chosen ? `Commit to "${chosen.idea_title}"?` : ''}
        description="This cannot be undone by you. Only an admin can add you back to a team."
        confirmLabel="Commit and leave the other ideas"
        destructive
        requiredConfirmationText={chosen?.team_name}
        onConfirm={handleConfirm}
      >
        {leaving.length > 0 && (
          <div className="space-y-2 text-sm">
            <p className="font-medium">You will be removed from:</p>
            <ul className="list-disc space-y-1 pl-5">
              {leaving.map((c) => (
                <li key={c.idea_id}>
                  {c.idea_title} <span className="text-muted-foreground">({c.team_name})</span>
                  {c.my_role === 'leader' && <span className="text-destructive"> · you are its team leader</span>}
                </li>
              ))}
            </ul>
            {leavingAsLeader.length > 0 && (
              <p className="text-destructive">
                {leavingAsLeader.length === 1 ? 'That team' : 'Those teams'} will lose their leader until an admin assigns
                a new one.
              </p>
            )}
          </div>
        )}
      </ConfirmDialog>
    </Alert>
  );
}
