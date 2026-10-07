import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable, type ResponsiveTableColumn } from '@/components/ui/responsive-table';
import { cn, formatDate } from '@/lib/utils';
import { reviewStatusKey } from '@/lib/constants/status';
import { getCurrentUser } from '@/lib/auth/session';
import { mentorProfileIdFor } from '@/lib/permissions/scopes';
import { resultColumns } from '@/components/ideas/result-columns';
import { fetchMyReviewQueue, filterQueueByTab, type ReviewQueueRow, type ReviewQueueTab } from '@/lib/services/my-reviews';

export const metadata = { title: 'My Reviews' };

const TABS: { value: ReviewQueueTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Not started' },
  { value: 'draft', label: 'In progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'reopened', label: 'Reopened' },
];

export default async function MyReviewsPage(props: { searchParams: Promise<{ tab?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  const mentorProfileId = user ? await mentorProfileIdFor(user.id) : null;

  if (!mentorProfileId) {
    return (
      <div>
        <PageHeader title="My Reviews" />
        <EmptyState icon={ClipboardCheck} title="Your account has no mentor profile" description="Ask a programme admin to create your mentor profile; reviews will appear here once ideas are routed to you." />
      </div>
    );
  }

  const tab = (searchParams.tab as ReviewQueueTab) ?? 'all';
  const allRows = await fetchMyReviewQueue(mentorProfileId);
  const rows = filterQueueByTab(allRows, tab);

  const columns: ResponsiveTableColumn<ReviewQueueRow>[] = [
    { key: 'idea_title', header: 'Idea', cell: (r) => r.idea_title, mobile: 'title' },
    { key: 'team_name', header: 'Team', cell: (r) => r.team_name },
    { key: 'submitted_at', header: 'Submitted', cell: (r) => formatDate(r.submitted_at) },
    {
      key: 'status',
      header: 'Review status',
      cell: (r) => <StatusBadge status={reviewStatusKey(r.review_status)} />,
    },
    ...resultColumns<ReviewQueueRow>(),
    {
      key: 'action',
      header: '',
      mobile: 'action',
      cell: (r) => (
        <Link
          href={`/reviews/${r.assignment_id}`}
          className="focus-ring font-semibold text-primary underline underline-offset-4 hover:decoration-2"
        >
          {r.review_status === 'not_started'
            ? 'Start review'
            : r.review_status === 'submitted'
              ? 'View review'
              : 'Continue review'}
          <span className="sr-only"> of {r.idea_title}</span>
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="My Reviews" description="Ideas routed to you for review." />

      <nav aria-label="Filter reviews" className="mb-4 flex flex-wrap gap-1 rounded-lg border bg-muted p-1 sm:inline-flex">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/reviews?tab=${t.value}`}
            aria-current={tab === t.value ? 'page' : undefined}
            className={cn(
              'focus-ring inline-flex min-h-10 items-center rounded-md px-3 text-sm font-semibold transition-colors',
              tab === t.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-background hover:text-foreground'
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <ResponsiveTable
        columns={columns}
        data={rows}
        getRowKey={(r) => r.assignment_id}
        emptyState={
          <EmptyState
            icon={ClipboardCheck}
            title={tab === 'all' ? 'No ideas have been routed to you yet' : 'No reviews in this list'}
            description={
              tab === 'all'
                ? 'When an admin routes an idea to you, it appears here and on your overview.'
                : 'Choose another filter above, or All to see every review routed to you.'
            }
          />
        }
      />
    </div>
  );
}
