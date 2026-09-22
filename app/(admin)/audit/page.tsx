import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { ExportButton } from '@/components/admin/export-button';
import { AuditDiff } from '@/components/admin/audit-diff';
import { fetchAuditLogs, fetchAuditFacets } from '@/lib/services/audit';
import { formatDate } from '@/lib/utils';
import { Shield } from 'lucide-react';

export const metadata = { title: 'Audit Log' };

const PAGE_SIZE = 25;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const page = Number(searchParams.page ?? '1') || 1;
  const filters = {
    dateFrom: searchParams.from,
    dateTo: searchParams.to,
    actor: searchParams.actor,
    entityType: searchParams.entity_type,
    action: searchParams.action,
    correlationId: searchParams.correlation_id,
    entityId: searchParams.entity_id,
    page,
    pageSize: PAGE_SIZE,
  };

  const [{ rows, total }, facets] = await Promise.all([fetchAuditLogs(filters), fetchAuditFacets()]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function qs(overrides: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    const merged = { ...searchParams, ...overrides };
    Object.entries(merged).forEach(([k, v]) => {
      if (v !== undefined && v !== '') params.set(k, String(v));
    });
    return `/audit?${params.toString()}`;
  }

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Full, read-only trail of every workflow decision and publish action."
        action={<ExportButton type="audit-data" label="Export CSV" />}
      />

      <form method="get" className="mb-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <input type="date" name="from" defaultValue={searchParams.from ?? ''} className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <input type="date" name="to" defaultValue={searchParams.to ?? ''} className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Actor name</label>
          <input type="text" name="actor" defaultValue={searchParams.actor ?? ''} placeholder="Search actor…" className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Entity type</label>
          <select name="entity_type" defaultValue={searchParams.entity_type ?? ''} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">All</option>
            {facets.entityTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Action</label>
          <select name="action" defaultValue={searchParams.action ?? ''} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">All</option>
            {facets.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Correlation ID</label>
          <input type="text" name="correlation_id" defaultValue={searchParams.correlation_id ?? ''} className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
        </div>
        <div className="sm:col-span-3 lg:col-span-6">
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Apply filters
          </button>
          <Link href="/audit" className="ml-3 text-sm text-muted-foreground hover:underline">
            Clear
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={Shield} title="No matching audit entries" description="Try widening your filters." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {r.action} <span className="text-muted-foreground">on</span> {r.entity_type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      by {r.actor_name ?? 'System'} · {formatDate(r.created_at)}
                      {r.correlation_id && ` · corr: ${r.correlation_id}`}
                    </p>
                  </div>
                  <Link href={`/audit?correlation_id=${r.correlation_id ?? ''}`} className="text-xs text-primary hover:underline">
                    View correlated events
                  </Link>
                </div>
                {r.reason && <p className="text-xs text-muted-foreground">Reason: {r.reason}</p>}
                <AuditDiff prior={r.prior_value} next={r.new_value} />
              </CardContent>
            </Card>
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
              <Link href={qs({ page: page - 1 })} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={qs({ page: page + 1 })} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
