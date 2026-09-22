import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ResponsiveTable, type ResponsiveTableColumn } from '@/components/ui/responsive-table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';
import { createClient } from '@/lib/supabase/server';
import { fetchMentorDashboard, type DashboardIdeaRow } from '@/lib/services/mentor-dashboard';
import { formatDate } from '@/lib/utils';
import type { StatusKey } from '@/lib/constants/status';
import type { ImpactType } from '@/types/database';

export const metadata = { title: 'Idea Dashboard' };

const IMPACT_OPTIONS: { value: ImpactType | 'all'; label: string }[] = [
  { value: 'all', label: 'All impact types' },
  { value: 'revenue_growth', label: 'Revenue growth' },
  { value: 'time_efficiency', label: 'Time efficiency' },
  { value: 'cost_efficiency', label: 'Cost efficiency' },
  { value: 'governance_improvement', label: 'Governance improvement' },
];

const STATUS_OPTIONS: { value: StatusKey | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'routing_required', label: 'Routing Required' },
  { value: 'waiting_assignment', label: 'Waiting Assignment' },
  { value: 'waiting_for_review', label: 'Waiting for Review' },
  { value: 'review_completed', label: 'Review Completed' },
  { value: 'awaiting_publication', label: 'Awaiting Publication' },
  { value: 'published', label: 'Published' },
];

export default async function MentorDashboardPage({
  searchParams,
}: {
  searchParams: { q?: string; impact?: string; status?: string; page?: string };
}) {
  const supabase = await createClient();
  const { data: program } = await supabase
    .from('programs')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!program) {
    return (
      <div>
        <PageHeader title="Idea Dashboard" />
        <EmptyState icon={LayoutDashboard} title="No active program" description="There is no active program right now." />
      </div>
    );
  }

  const page = Number(searchParams.page ?? '1') || 1;
  const { rows, total } = await fetchMentorDashboard(program.id, {
    search: searchParams.q,
    impactType: (searchParams.impact as ImpactType | 'all') ?? 'all',
    status: (searchParams.status as StatusKey | 'all') ?? 'all',
    page,
    pageSize: 10,
  });
  const totalPages = Math.max(1, Math.ceil(total / 10));

  const columns: ResponsiveTableColumn<DashboardIdeaRow>[] = [
    { key: 'idea_title', header: 'Idea', cell: (r) => r.idea_title },
    { key: 'team_name', header: 'Team', cell: (r) => r.team_name },
    { key: 'submitted_at', header: 'Submitted', cell: (r) => formatDate(r.submitted_at) },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.workflow_status} /> },
  ];

  function buildHref(overrides: Record<string, string>) {
    const params = new URLSearchParams({
      q: searchParams.q ?? '',
      impact: searchParams.impact ?? 'all',
      status: searchParams.status ?? 'all',
      page: String(page),
      ...overrides,
    });
    return `/dashboard?${params.toString()}`;
  }

  return (
    <div>
      <PageHeader title="Idea Dashboard" description="All submitted ideas across the program." />

      <form className="mb-4 flex flex-wrap gap-3" action="/dashboard" method="get">
        <Input name="q" placeholder="Search idea or team…" defaultValue={searchParams.q} className="max-w-xs" />
        {/* Native <select> here (not the Radix Select) so this plain GET
            form works without JS — Radix Select renders no real form
            control, so it can't participate in a native form submit. */}
        <select
          name="impact"
          defaultValue={searchParams.impact ?? 'all'}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
        >
          {IMPACT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={searchParams.status ?? 'all'}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      <ResponsiveTable
        columns={columns}
        data={rows}
        getRowKey={(r) => r.id}
        emptyState={<EmptyState icon={LayoutDashboard} title="No matching ideas" description="Try adjusting your filters." />}
      />

      {totalPages > 1 && (
        <Pagination className="mt-6">
          <PaginationContent>
            {Array.from({ length: totalPages }).map((_, i) => (
              <PaginationItem key={i}>
                <PaginationLink href={buildHref({ page: String(i + 1) })} isActive={page === i + 1}>
                  {i + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
