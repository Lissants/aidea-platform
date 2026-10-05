'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, UserMinus, UserPlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/layout/confirm-dialog';
import { AssignTeamMemberDialog } from '@/components/admin/assign-team-member-dialog';
import { adminRemoveTeamMember } from '@/lib/services/team-membership';

const MAX_TEAM_MEMBERS = 5;

interface TeamManagementCardProps {
  ideaId: string;
  leader: { profile_id: string; full_name: string } | null;
  members: { profile_id: string; full_name: string }[];
}

/**
 * Admin team changes on a submitted idea (resignation, leave, ...). Removing
 * someone never assigns a replacement automatically: the admin agrees it with
 * the team offline, then uses "Add replacement member" / "Assign leader".
 */
export function TeamManagementCard({ ideaId, leader, members }: TeamManagementCardProps) {
  const router = useRouter();
  const [removing, setRemoving] = React.useState<{ profile_id: string; full_name: string; isLeader: boolean } | null>(null);
  const [reason, setReason] = React.useState('');
  const [assign, setAssign] = React.useState<'leader' | 'member' | null>(null);

  async function handleRemove() {
    if (!removing) return;
    const result = await adminRemoveTeamMember(ideaId, removing.profile_id, reason);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`${removing.full_name} removed from the team`);
    setReason('');
    router.refresh();
  }

  const row = (p: { profile_id: string; full_name: string }, isLeader: boolean) => (
    <div key={p.profile_id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div className="text-sm">
        <span className="font-medium">{p.full_name}</span>
        <span className="ml-2 text-xs text-muted-foreground">{isLeader ? 'Team leader' : 'Team member'}</span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => setRemoving({ ...p, isLeader })}
      >
        <UserMinus className="h-4 w-4" /> Remove
      </Button>
    </div>
  );

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Team</CardTitle>
        <div className="flex flex-wrap gap-2">
          {!leader && (
            <Button size="sm" onClick={() => setAssign('leader')}>
              <UserPlus className="h-4 w-4" /> Assign leader
            </Button>
          )}
          {members.length < MAX_TEAM_MEMBERS && (
            <Button size="sm" variant="outline" onClick={() => setAssign('member')}>
              <UserPlus className="h-4 w-4" /> Add replacement member
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {!leader && (
          <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm font-semibold text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> Leader vacant. Assign a new team leader.
          </div>
        )}
        {leader && row(leader, true)}
        {members.map((m) => row(m, false))}
        {members.length === 0 && <p className="text-sm text-muted-foreground">No team members.</p>}
      </CardContent>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
            setReason('');
          }
        }}
        title={removing ? `Remove ${removing.full_name} from this team?` : ''}
        description={
          removing?.isLeader
            ? 'The team leader slot will be vacant until you assign a new leader. No replacement is assigned automatically.'
            : 'No replacement is assigned automatically. Agree the replacement with the team first, then add them here.'
        }
        confirmLabel="Remove"
        destructive
        confirmDisabled={reason.trim().length < 5}
        onConfirm={handleRemove}
      >
        <div className="space-y-1.5">
          <Label htmlFor="remove-reason">Reason (required, e.g. resigned, maternity leave)</Label>
          <Textarea id="remove-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </div>
      </ConfirmDialog>

      <AssignTeamMemberDialog
        open={assign !== null}
        onOpenChange={(open) => !open && setAssign(null)}
        ideaId={ideaId}
        asLeader={assign === 'leader'}
        members={members}
      />
    </Card>
  );
}
