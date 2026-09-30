'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { ResponsiveTable, type ResponsiveTableColumn } from '@/components/ui/responsive-table';
import { EmptyState } from '@/components/layout/empty-state';
import { ClipboardList } from 'lucide-react';
import { AssignReviewerDialog } from '@/components/admin/assign-reviewer-dialog';
import type { RoutingQueueRow, MentorCapacityRow } from '@/lib/services/review-assignment';

export function RoutingQueueTable({ rows, mentors }: { rows: RoutingQueueRow[]; mentors: MentorCapacityRow[] }) {
  const [dialogRow, setDialogRow] = React.useState<RoutingQueueRow | null>(null);
  // Deep-linked from the Mentor Directory ("view this mentor's queue") —
  // ?mentor=<mentor_profile_id> pre-filters to that mentor's assignments.
  const searchParams = useSearchParams();
  const mentorFilter = searchParams.get('mentor');
  const visibleRows = mentorFilter ? rows.filter((r) => r.current_mentor_id === mentorFilter) : rows;

  const columns: ResponsiveTableColumn<RoutingQueueRow>[] = [
    { key: 'idea_title', header: 'Idea', cell: (r) => r.idea_title },
    { key: 'team_name', header: 'Team', cell: (r) => r.team_name },
    {
      key: 'preferences',
      header: 'Preferred mentors',
      cell: (r) => (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {r.preferences
            .sort((a, b) => a.priority - b.priority)
            .map((p) => (
              <div key={p.priority}>
                P{p.priority}: {p.mentor_name}
              </div>
            ))}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <StatusBadge status={r.status === 'routing_required' ? 'routing_required' : 'assigned'} />,
    },
    {
      key: 'current_mentor',
      header: 'Current reviewer',
      cell: (r) => r.current_mentor_name ?? '—',
    },
    {
      key: 'action',
      header: '',
      cell: (r) => (
        <Button size="sm" variant="outline" onClick={() => setDialogRow(r)}>
          {r.current_mentor_id ? 'Change reviewer' : 'Assign'}
        </Button>
      ),
    },
  ];

  return (
    <>
      <ResponsiveTable
        columns={columns}
        data={visibleRows}
        getRowKey={(r) => r.assignment_id}
        emptyState={
          <EmptyState
            icon={ClipboardList}
            title="Nothing needs attention"
            description={mentorFilter ? 'This mentor has no active assignments.' : 'Every submitted idea has an assigned reviewer.'}
          />
        }
      />
      {dialogRow && (
        <AssignReviewerDialog
          open={!!dialogRow}
          onOpenChange={(open) => !open && setDialogRow(null)}
          assignmentId={dialogRow.assignment_id}
          ideaId={dialogRow.idea_id}
          currentMentorId={dialogRow.current_mentor_id}
          mentors={mentors}
        />
      )}
    </>
  );
}
