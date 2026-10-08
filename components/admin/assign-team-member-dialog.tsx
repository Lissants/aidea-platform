'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  adminAddTeamMember,
  searchReplacementCandidates,
  type ReplacementCandidate,
} from '@/lib/services/team-membership';

interface AssignTeamMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ideaId: string;
  /** true = fill the vacant leader slot; false = add a replacement team member. */
  asLeader: boolean;
  /** Current members, offered first for promotion when assigning a leader. */
  members: { profile_id: string; full_name: string }[];
}

type Pick = { id: string; full_name: string; conflict_idea_title: string | null; promote: boolean };

export function AssignTeamMemberDialog({ open, onOpenChange, ideaId, asLeader, members }: AssignTeamMemberDialogProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [results, setResults] = React.useState<ReplacementCandidate[]>([]);
  const [selected, setSelected] = React.useState<Pick | null>(null);
  const [override, setOverride] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSearch('');
      setResults([]);
      setSelected(null);
      setOverride(false);
      setReason('');
    }
    onOpenChange(next);
  }

  const searching = search.trim().length >= 2;

  React.useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const rows = await searchReplacementCandidates(ideaId, search);
      if (!cancelled) setResults(rows);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, searching, ideaId]);

  const needsOverride = !!selected && !selected.promote && !!selected.conflict_idea_title;
  const reasonOk = reason.trim().length >= 5;
  const canSave = !!selected && (!needsOverride || (override && reasonOk));

  async function handleSave() {
    if (!selected) return;
    setPending(true);
    const result = await adminAddTeamMember(ideaId, selected.id, {
      asLeader,
      override: needsOverride && override,
      reason: reason.trim() || null,
    });
    setPending(false);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    toast.success(asLeader ? `${selected.full_name} is now the team leader` : `${selected.full_name} added to the team`);
    handleOpenChange(false);
    router.refresh();
  }

  const outsiders = searching ? results.filter((r) => !r.on_this_team) : [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{asLeader ? 'Assign team leader' : 'Add replacement member'}</DialogTitle>
          <DialogDescription>
            Only do this after agreeing the change with the team. The person you pick will be notified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {asLeader && members.length > 0 && (
            <div className="space-y-1.5">
              <Label>Promote a current team member</Label>
              <div className="space-y-1 rounded-md border p-2">
                {members.map((m) => (
                  <button
                    key={m.profile_id}
                    type="button"
                    onClick={() =>
                      setSelected({ id: m.profile_id, full_name: m.full_name, conflict_idea_title: null, promote: true })
                    }
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                      selected?.id === m.profile_id ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
                    }`}
                  >
                    <span>{m.full_name}</span>
                    <span className="text-xs text-muted-foreground">Promote</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="replacement-search">{asLeader ? 'Or bring in another employee' : 'Employee'}</Label>
            <Input
              id="replacement-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              autoComplete="off"
            />
            {outsiders.length > 0 && (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {outsiders.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSelected({ id: r.id, full_name: r.full_name, conflict_idea_title: r.conflict_idea_title, promote: false });
                      setOverride(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm ${
                      selected?.id === r.id ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
                    } ${r.conflict_idea_title ? 'opacity-60' : ''}`}
                  >
                    <span>{r.full_name}</span>
                    <span className="text-right text-xs text-muted-foreground">
                      {r.conflict_idea_title ? `Not eligible: on "${r.conflict_idea_title}"` : r.email}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {needsOverride && (
            <div className="space-y-2 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm">
              <p>
                {selected?.full_name} is already on the submitted idea &ldquo;{selected?.conflict_idea_title}&rdquo;.
                Replacements should not be on another submitted team.
              </p>
              <label className="flex items-center gap-2">
                <Checkbox checked={override} onCheckedChange={(v) => setOverride(v === true)} />
                Override eligibility
              </label>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="assign-reason">Reason {needsOverride ? '(required for override)' : '(optional)'}</Label>
            <Textarea id="assign-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending || !canSave}>
            {pending ? 'Saving…' : asLeader ? 'Assign leader' : 'Add member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
