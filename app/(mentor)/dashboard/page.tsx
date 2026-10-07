import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { NoActiveProgram } from '@/components/layout/no-active-program';
import { EmptyState } from '@/components/layout/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ResponsiveTable, type ResponsiveTableColumn } from '@/components/ui/responsive-table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination';
import { db } from '@/lib/db';
import { resultColumns } from '@/components/ideas/result-columns';
import { PresentationLink } from '@/components/ideas/presentation-link';
import { fetchMentorDashboard, type DashboardIdeaRow } from '@/lib/services/mentor-dashboard';
import { formatDate } from '@/lib/utils';
import { STATUS_META, type StatusKey } from '@/lib/constants/status';
import type { ImpactType } from '@/types/database';
import { IMPACT_TYPE_OPTIONS } from '@/lib/constants/impact';

export const metadata = { title: 'Idea Dashboard' };

const IMPACT_OPTIONS: { value: ImpactType | 'all'; label: string }[] = [
  { value: 'all', label: 'All impact types' },
  ...IMPACT_TYPE_OPTIONS,
];

const STATUS_FILTERS: StatusKey[] = [
  'routing_required',
  'waiting_assignment',
  'waiting_for_review',
  'review_completed',
  'awaiting_publication',
  'published',
];

// Labels come from the shared status vocabulary so filters match the badges.
const STATUS_OPTIONS: { value: StatusKey | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  ...STATUS_FILTERS.map((value) => ({ value, label: STATUS_META[value].label })),
];

const SELECT_CLASS =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:h-9';

export default async function MentorDashboardPage(props: {
  searchParams: Promise<{ q?: string; impact?: string; status?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const program = await db.queryOne<{ id: string }>(
    `SELECT TOP (1) id FROM programs WHERE status = 'active' ORDER BY created_at DESC`
  );

  if (!program) {
    return (
      <div>
        <PageHeader title="Idea Dashboard" />
        <NoActiveProgram audience="mentor" />
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
    { key: 'idea_title', header: 'Idea', cell: (r) => r.idea_title, mobile: 'title' },
    { key: 'team_name', header: 'Team', cell: (r) => r.team_name },
    { key: 'submitted_at', header: 'Submitted', cell: (r) => formatDate(r.submitted_at) },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.workflow_status} /> },
    ...resultColumns<DashboardIdeaRow>(),
    {
      key: 'presentation',
      header: 'Presentation',
      cell: (r) =>
        r.presentation_url ? (
          <PresentationLink url={r.presentation_url} name={r.presentation_name} />
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
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

      <form
        role="search"
        aria-label="Filter ideas"
        className="mb-6 grid grid-cols-2 items-end gap-3 border-b pb-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        action="/dashboard"
        method="get"
      >
        <div className="col-span-2 space-y-1.5 lg:col-span-1">
          <Label htmlFor="dashboard-q">Search</Label>
          <Input id="dashboard-q" type="search" name="q" placeholder="Idea or team name…" defaultValue={searchParams.q} />
        </div>
        {/* Native <select> here (not the Radix Select) so this plain GET
            form works without JS — Radix Select renders no real form
            control, so it can't participate in a native form submit. */}
        <div className="space-y-1.5">
          <Label htmlFor="dashboard-impact">Impact type</Label>
          <select id="dashboard-impact" name="impact" defaultValue={searchParams.impact ?? 'all'} className={SELECT_CLASS}>
            {IMPACT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dashboard-status">Status</Label>
          <select id="dashboard-status" name="status" defaultValue={searchParams.status ?? 'all'} className={SELECT_CLASS}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" className="col-span-2 lg:col-span-1">
          Apply filters
        </Button>
      </form>

      <ResponsiveTable
        columns={columns}
        data={rows}
        getRowKey={(r) => r.id}
        emptyState={
          <EmptyState
            icon={LayoutDashboard}
            title="No ideas match these filters"
            description="Clear the search or choose All in each filter to see every submitted idea."
          />
        }
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
