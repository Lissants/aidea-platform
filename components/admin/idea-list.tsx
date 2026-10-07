'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import { AttentionFlag } from '@/components/ui/attention-flag';
import { ConfirmDialog } from '@/components/layout/confirm-dialog';
import { deleteIdeas } from '@/lib/services/idea-deletion';
import { stageStatusKey } from '@/lib/constants/status';
import { impactTypeLabel } from '@/lib/constants/impact';
import type { IdeaListRow } from '@/lib/services/idea-management';

const CONFIRM_TEXT = 'DELETE';

/** Shared delete confirmation; resolves true when the ideas were deleted. */
function useDeleteIdeas() {
  return React.useCallback(async (ids: string[]) => {
    const result = await deleteIdeas(ids);
    if ('error' in result) {
      toast.error(result.error);
      return false;
    }
    toast.success(result.deleted === 1 ? 'Idea deleted' : `${result.deleted} ideas deleted`);
    return true;
  }, []);
}

/**
 * Developer-only "Delete idea" button. Full button on the idea detail page
 * (then redirects to `redirectTo`); `compact` renders an icon button for
 * lists such as the Voting candidates (then refreshes in place).
 */
export function DeleteIdeaButton({
  ideaId,
  ideaTitle,
  redirectTo,
  compact = false,
}: {
  ideaId: string;
  ideaTitle: string;
  redirectTo?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const remove = useDeleteIdeas();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      {compact ? (
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={`Delete ${ideaTitle || 'untitled idea'}`}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      ) : (
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" aria-hidden /> Delete idea
        </Button>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        destructive
        title="Delete this idea?"
        description={`"${ideaTitle || 'Untitled draft'}" and everything attached to it (team, reviews, decisions, votes, uploaded files) will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete idea"
        requiredConfirmationText={CONFIRM_TEXT}
        onConfirm={async () => {
          if (!(await remove([ideaId]))) return;
          if (redirectTo) router.push(redirectTo);
          else router.refresh();
        }}
      />
    </>
  );
}

/**
 * Admin › Ideas list. With `canDelete` (Developer role) each row gets a
 * checkbox and a delete button, plus a bulk "Delete selected" action — used
 * to clear test submissions before UAT. Controls sit outside the row link
 * (interactive content can't nest inside an anchor).
 */
export function IdeaList({ rows, canDelete }: { rows: IdeaListRow[]; canDelete: boolean }) {
  const router = useRouter();
  const remove = useDeleteIdeas();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = React.useState<string[] | null>(null);

  // Only rows still on this page count (ignores stale ids after a delete or page change).
  const selectedIds = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const pendingTitle =
    pendingIds?.length === 1 ? rows.find((r) => r.id === pendingIds[0])?.idea_title || 'Untitled draft' : null;

  return (
    <>
      {canDelete && (
        <div className="mb-3 flex min-h-9 flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={(v) => setSelected(v === true ? new Set(rows.map((r) => r.id)) : new Set())}
              aria-label="Select all ideas on this page"
            />
            Select all on this page
          </label>
          {selectedIds.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setPendingIds(selectedIds)}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete selected ({selectedIds.length})
            </Button>
          )}
        </div>
      )}

      <ul className="divide-y rounded-xl border bg-card">
        {rows.map((r) => (
          <li key={r.id} className="flex items-stretch">
            {canDelete && (
              <div className="flex items-center pl-4">
                <Checkbox
                  checked={selected.has(r.id)}
                  onCheckedChange={(v) => toggle(r.id, v === true)}
                  aria-label={`Select ${r.idea_title || 'untitled draft'}`}
                />
              </div>
            )}
            <Link
              href={`/ideas/${r.id}`}
              className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <p className="break-words font-semibold">
                  {r.idea_title || <span className="font-normal text-muted-foreground">Untitled draft</span>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[r.team_name, r.impact_type ? impactTypeLabel(r.impact_type) : null, r.reviewer_name ? `Reviewer: ${r.reviewer_name}` : null]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {r.leader_vacant && <AttentionFlag>Leader vacant</AttentionFlag>}
                {r.membership_conflict && <AttentionFlag>Membership conflict</AttentionFlag>}
                <StatusBadge status={stageStatusKey(r.stage)} />
              </div>
            </Link>
            {canDelete && (
              <div className="flex items-center pr-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPendingIds([r.id])}
                  aria-label={`Delete ${r.idea_title || 'untitled draft'}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {canDelete && (
        <ConfirmDialog
          open={pendingIds !== null}
          onOpenChange={(open) => !open && setPendingIds(null)}
          destructive
          title={pendingIds?.length === 1 ? 'Delete this idea?' : `Delete ${pendingIds?.length ?? 0} ideas?`}
          description={`${
            pendingTitle ? `"${pendingTitle}"` : `${pendingIds?.length ?? 0} ideas`
          } and everything attached (team, reviews, decisions, votes, uploaded files) will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete permanently"
          requiredConfirmationText={CONFIRM_TEXT}
          onConfirm={async () => {
            if (!pendingIds) return;
            if (await remove(pendingIds)) {
              setSelected(new Set());
              router.refresh();
            }
          }}
        />
      )}
    </>
  );
}
