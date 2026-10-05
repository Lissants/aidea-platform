import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { NoActiveProgram } from '@/components/layout/no-active-program';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ExportButton } from '@/components/admin/export-button';
import { IdeaList } from '@/components/admin/idea-list';
import { fetchIdeaList } from '@/lib/services/idea-management';
import { STAGE_LABEL } from '@/lib/ideas/stage';
import { db } from '@/lib/db';
import { IMPACT_TYPE_OPTIONS } from '@/lib/constants/impact';
import { getCurrentUser } from '@/lib/auth/session';
import { isDeveloper } from '@/lib/permissions';

export const metadata = { title: 'Idea Management' };

const PAGE_SIZE = 20;

const FIELD_CLASS =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:h-9';

export default async function IdeaManagementPage(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  const canDelete = !!user && isDeveloper(user.roles);
  const program = await db.queryOne<{ id: string }>(
    `SELECT TOP (1) id FROM programs WHERE status = 'active' ORDER BY created_at DESC`
  );

  if (!program) {
    return (
      <div>
        <PageHeader title="Idea Management" />
        <NoActiveProgram audience="admin" />
      </div>
    );
  }

  const page = Number(searchParams.page ?? '1') || 1;
  const { rows, total } = await fetchIdeaList(program.id, {
    q: searchParams.q,
    impactType: searchParams.impact,
    status: searchParams.status,
    stage: searchParams.stage,
    sort: (searchParams.sort as any) ?? 'newest',
    page,
    pageSize: PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(searchParams.q || searchParams.impact || searchParams.stage || searchParams.status);

  function pageHref(p: number) {
    const params = new URLSearchParams(searchParams as Record<string, string>);
    params.set('page', String(p));
    return `/ideas?${params.toString()}`;
  }

  return (
    <div>
      <PageHeader
        title="Idea Management"
        description="Browse, filter, and drill into every idea in the active program."
        action={<ExportButton type="submissions" label="Export CSV" />}
      />

      <form method="get" role="search" aria-label="Filter ideas" className="mb-6 grid grid-cols-2 items-end gap-3 border-b pb-6 lg:grid-cols-6">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="ideas-q">Search</Label>
          <input
            id="ideas-q"
            type="search"
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="Idea title or team name…"
            className={FIELD_CLASS}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ideas-impact">Impact type</Label>
          <select id="ideas-impact" name="impact" defaultValue={searchParams.impact ?? ''} className={FIELD_CLASS}>
            <option value="">All impact types</option>
            {IMPACT_TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ideas-stage">Stage</Label>
          <select id="ideas-stage" name="stage" defaultValue={searchParams.stage ?? ''} className={FIELD_CLASS}>
            <option value="">All stages</option>
            {Object.entries(STAGE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ideas-sort">Sort by</Label>
          <select id="ideas-sort" name="sort" defaultValue={searchParams.sort ?? 'newest'} className={FIELD_CLASS}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit">Apply filters</Button>
          {hasFilters && (
            <Link href="/ideas" className="focus-ring text-sm text-muted-foreground underline underline-offset-4">
              Clear
            </Link>
          )}
        </div>
      </form>

      <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
        {total} {total === 1 ? 'idea' : 'ideas'}
        {hasFilters ? ' match these filters' : ''}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title={hasFilters ? 'No ideas match these filters' : 'No ideas in this program yet'}
          description={
            hasFilters
              ? 'Clear a filter or search for a shorter part of the title.'
              : 'Ideas appear here as soon as participants save their first draft.'
          }
        />
      ) : (
        <IdeaList rows={rows} canDelete={canDelete} />
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(page - 1)}>Previous</Link>
              </Button>
            )}
            {page < totalPages && (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(page + 1)}>Next</Link>
              </Button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
