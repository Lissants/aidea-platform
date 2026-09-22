import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Badge } from '@/components/ui/badge';
import { ResponsiveTable, type ResponsiveTableColumn } from '@/components/ui/responsive-table';
import { cn, formatDate } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { fetchMyReviewQueue, filterQueueByTab, type ReviewQueueRow, type ReviewQueueTab } from '@/lib/services/my-reviews';

export const metadata = { title: 'My Reviews' };

const TABS: { value: ReviewQueueTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'reopened', label: 'Reopened' },
];

const REVIEW_STATUS_LABEL: Record<ReviewQueueRow['review_status'], string> = {
  not_started: 'Not started',
  draft: 'Draft',
  submitted: 'Submitted',
  reopened: 'Reopened',
};

export default async function MyReviewsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: searchTab } = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: mentorProfile } = user
    ? await supabase.from('mentor_profiles').select('id').eq('profile_id', user.id).maybeSingle()
    : { data: null };

  if (!mentorProfile) {
    return (
      <div>
        <PageHeader title="My Reviews" />
        <EmptyState icon={ClipboardCheck} title="No mentor profile" description="Your account isn't set up as a mentor yet." />
      </div>
    );
  }

  const tab = (searchTab as ReviewQueueTab) ?? 'all';
  const allRows = await fetchMyReviewQueue(mentorProfile.id);
  const rows = filterQueueByTab(allRows, tab);

  const columns: ResponsiveTableColumn<ReviewQueueRow>[] = [
    { key: 'idea_title', header: 'Idea', cell: (r) => r.idea_title },
    { key: 'team_name', header: 'Team', cell: (r) => r.team_name },
    { key: 'submitted_at', header: 'Submitted', cell: (r) => formatDate(r.submitted_at) },
    {
      key: 'status',
      header: 'Review status',
      cell: (r) => (
        <Badge variant={r.review_status === 'submitted' ? 'success' : r.review_status === 'reopened' ? 'warning' : 'secondary'}>
          {REVIEW_STATUS_LABEL[r.review_status]}
        </Badge>
      ),
    },
    {
      key: 'action',
      header: '',
      cell: (r) => (
        <Link href={`/reviews/${r.assignment_id}`} className="text-sm font-medium text-primary hover:underline">
          {r.review_status === 'not_started' ? 'Start review' : 'Open'}
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="My Reviews" description="Ideas routed to you for review." />

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-muted p-1 sm:inline-flex">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/reviews?tab=${t.value}`}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.value ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <ResponsiveTable
        columns={columns}
        data={rows}
        getRowKey={(r) => r.assignment_id}
        emptyState={<EmptyState icon={ClipboardCheck} title="Nothing here" description="No reviews match this filter." />}
      />
    </div>
  );
}
