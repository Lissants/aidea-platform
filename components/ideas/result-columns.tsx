import { StatusBadge } from '@/components/ui/status-badge';
import type { ResponsiveTableColumn } from '@/components/ui/responsive-table';
import type { PublishedResults } from '@/lib/ideas/published-results';

// Drafts have no results yet ("-"); a submitted idea with nothing published shows N/A.
const NONE = <span className="text-muted-foreground">-</span>;

/** Screening / Qualifier / Project Mentor columns for any table of ideas. */
export function resultColumns<T extends PublishedResults>(isDraft: (row: T) => boolean = () => false): ResponsiveTableColumn<T>[] {
  return [
    {
      key: 'screening',
      header: 'Screening',
      cell: (row) =>
        isDraft(row) ? (
          NONE
        ) : (
          <StatusBadge
            status={row.screening === 'pass_to_qualifier' ? 'pass' : row.screening === 'not_pass' ? 'not_pass' : 'not_applicable'}
          />
        ),
    },
    {
      key: 'qualifier',
      header: 'Qualifier',
      cell: (row) =>
        isDraft(row) ? (
          NONE
        ) : (
          <StatusBadge status={row.qualifier === 'build' ? 'build' : row.qualifier === 'no_build' ? 'no_build' : 'not_applicable'} />
        ),
    },
    {
      key: 'mentor_name',
      header: 'Project Mentor',
      cell: (row) => (isDraft(row) ? NONE : (row.mentor_name ?? 'N/A')),
    },
  ];
}
