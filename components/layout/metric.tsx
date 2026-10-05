import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface MetricItem {
  label: string;
  value: number;
  href?: string;
  /** Short qualifier under the label, e.g. "need manual assignment". */
  hint?: string;
}

/**
 * A row of counts, read left to right. Replaces the per-role stat-card
 * copies: numbers are text with tabular figures, not decorated tiles.
 */
export function MetricRow({ items, label, className }: { items: MetricItem[]; label: string; className?: string }) {
  return (
    <ul
      aria-label={label}
      // 1px gaps over a border-coloured background draw the dividers; an odd last
      // cell spans both columns on mobile so no empty cell shows.
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:flex [&>li:last-child:nth-child(odd)]:col-span-2',
        className
      )}
    >
      {items.map((item) => {
        const body = (
          <>
            <span className="block text-2xl font-bold tabular-nums leading-tight">{item.value}</span>
            <span className="block text-sm font-semibold">{item.label}</span>
            {item.hint && <span className="block text-xs text-muted-foreground">{item.hint}</span>}
          </>
        );
        return (
          <li key={item.label} className="min-w-0 bg-background lg:flex-1">
            {item.href ? (
              <Link
                href={item.href}
                className="block h-full px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {body}
              </Link>
            ) : (
              <div className="px-4 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
