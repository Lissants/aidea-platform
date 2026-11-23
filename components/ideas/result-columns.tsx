import { StatusBadge } from '@/components/ui/status-badge';
import type { ResponsiveTableColumn } from '@/components/ui/responsive-table';
import type { PublishedResults } from '@/lib/ideas/published-results';
import type { StatusKey } from '@/lib/constants/status';

// Drafts have no results yet ("-"); a submitted idea with nothing published shows N/A.
const NONE = <span className="text-muted-foreground">-</span>;

/** Published screening outcome → badge. Shared by the results table and the idea detail page. */
export function screeningBadgeStatus(screening: PublishedResults['screening']): StatusKey {
  return screening === 'pass_to_qualifier' ? 'pass' : screening === 'not_pass' ? 'not_pass' : 'not_applicable';
}

/** Published qualifier outcome → badge. */
export function qualifierBadgeStatus(qualifier: PublishedResults['qualifier']): StatusKey {
  return qualifier === 'build' ? 'build' : qualifier === 'no_build' ? 'no_build' : 'not_applicable';
}

/** Screening / Qualifier / Project Mentor columns for any table of ideas. */
export function resultColumns<T extends PublishedResults>(isDraft: (row: T) => boolean = () => false): ResponsiveTableColumn<T>[] {
  return [
    {
      key: 'screening',
      header: 'Screening',
      cell: (row) => (isDraft(row) ? NONE : <StatusBadge status={screeningBadgeStatus(row.screening)} />),
    },
    {
      key: 'qualifier',
      header: 'Qualifier',
      cell: (row) => (isDraft(row) ? NONE : <StatusBadge status={qualifierBadgeStatus(row.qualifier)} />),
    },
    {
      key: 'mentor_name',
      header: 'Project Mentor',
      cell: (row) => (isDraft(row) ? NONE : (row.mentor_name ?? 'N/A')),
    },
  ];
}
