import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { ExportButton } from '@/components/admin/export-button';
import { fetchIdeaList } from '@/lib/services/idea-management';
import { STAGE_LABEL } from '@/lib/ideas/stage';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Idea Management' };

const PAGE_SIZE = 20;
const IMPACT_TYPES = ['revenue_growth', 'time_efficiency', 'cost_efficiency', 'governance_improvement'];

export default async function IdeaManagementPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const supabase = createClient();
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
        <PageHeader title="Idea Management" />
        <EmptyState icon={Lightbulb} title="No active program" description="There is no active program right now." />
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

  function pageHref(p: number) {
    const params = new URLSearchParams(searchParams as Record<string, string>);
    params.set('page', String(p));
    return `/ideas?${params.toString()}`;
  }

  return (
    <div>
      <PageHeader
        title="Idea Management"
        description="Browse, filter, and drill into every submitted idea across the program."
        action={<ExportButton type="submissions" label="Export CSV" />}
      />

      <form method="get" className="mb-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <input
          type="text"
          name="q"
          defaultValue={searchParams.q ?? ''}
          placeholder="Search title or team…"
          className="h-9 rounded-md border bg-background px-2 text-sm lg:col-span-2"
        />
        <select name="impact" defaultValue={searchParams.impact ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">All impact types</option>
          {IMPACT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <select name="stage" defaultValue={searchParams.stage ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">All stages</option>
          {Object.entries(STAGE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={searchParams.sort ?? 'newest'} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title A–Z</option>
        </select>
        <div className="sm:col-span-2 lg:col-span-5">
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Apply
          </button>
          <Link href="/ideas" className="ml-3 text-sm text-muted-foreground hover:underline">
            Clear
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={Lightbulb} title="No ideas match" description="Try widening your filters." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link key={r.id} href={`/ideas/${r.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div>
                    <p className="text-sm font-medium">{r.idea_title}</p>
                    <p className="text-xs text-muted-foreground">{r.team_name}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {r.impact_type && <span>{r.impact_type.replace(/_/g, ' ')}</span>}
                    {r.reviewer_name && <span>Reviewer: {r.reviewer_name}</span>}
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">{STAGE_LABEL[r.stage]}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
