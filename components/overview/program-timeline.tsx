import { Check } from 'lucide-react';
import type { Program } from '@/types/database';
import { TIMELINE_STAGES, parseTimelineTba } from '@/lib/program/timeline';
import { cn } from '@/lib/utils';

function formatDay(iso: string, now: Date) {
  const d = new Date(iso);
  // Year only when it differs from today's, to keep the cells short.
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/**
 * The program's public stages in order. It is a real sequence, so the steps
 * are numbered; the next upcoming stage is marked "Next". A stage an admin
 * marked TBA shows its message instead of the date (the real date never
 * reaches the page), and still counts as done once that date has passed.
 */
export function ProgramTimeline({ program, now = new Date() }: { program: Program; now?: Date }) {
  const tba = parseTimelineTba(program.timeline_tba);
  const steps = TIMELINE_STAGES.flatMap((m) => {
    const iso = program[m.key];
    const mask = tba[m.key]?.hidden ? tba[m.key]!.text : null;
    if (!iso && !mask) return [];
    return [{ ...m, mask, past: !!iso && new Date(iso) < now, dateLabel: mask ?? formatDay(iso!, now), iso }];
  });
  if (steps.length === 0) return null;
  const nextIndex = steps.findIndex((s) => !s.past);

  return (
    <ol className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 sm:[&>li:last-child:nth-child(odd)]:col-span-2 xl:grid-flow-col xl:auto-cols-fr xl:grid-cols-none xl:[&>li:last-child:nth-child(odd)]:col-span-1">
      {steps.map((s, i) => {
        const isNext = i === nextIndex;
        const dateClass = cn('block text-sm', isNext ? 'text-primary-foreground' : 'text-muted-foreground');
        const dateText = isNext ? `Next, ${s.dateLabel}` : s.dateLabel;
        return (
          <li
            key={s.key}
            aria-current={isNext ? 'step' : undefined}
            className={cn('flex gap-3 px-4 py-3', isNext ? 'bg-primary text-primary-foreground' : 'bg-background')}
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums',
                s.past && 'border-transparent bg-muted text-muted-foreground',
                isNext && 'border-primary-foreground'
              )}
            >
              {s.past ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={cn('block text-sm font-semibold', s.past && 'text-muted-foreground')}>
                {s.label}
                {s.past && <span className="sr-only"> (done)</span>}
              </span>
              {s.mask || !s.iso ? (
                <span className={dateClass}>{dateText}</span>
              ) : (
                <time dateTime={s.iso} className={dateClass}>
                  {dateText}
                </time>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
