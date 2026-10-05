import { Skeleton } from '@/components/ui/skeleton';

export function CardGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border p-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      ))}
    </div>
  );
}

export function TableRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-2 pb-6">
      <Skeleton className="h-7 w-64 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}

/**
 * Route-level loading UI (loading.tsx). Shown inside the app shell while a
 * page's server queries run, so navigation responds immediately.
 */
export function PageLoading({ label = 'Loading page' }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="max-w-5xl">
      <span className="sr-only">{label}…</span>
      <PageHeaderSkeleton />
      <TableRowsSkeleton rows={6} />
    </div>
  );
}
