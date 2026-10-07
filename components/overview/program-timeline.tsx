import { Check } from 'lucide-react';
import type { Program } from '@/types/database';
import { cn } from '@/lib/utils';

const MILESTONES: { key: keyof Program; label: string }[] = [
  { key: 'submission_close_at', label: 'Submissions close' },
  { key: 'screening_close_at', label: 'Screening results' },
  { key: 'qualifier_close_at', label: 'Qualifier results' },
  { key: 'final_presentation_close_at', label: 'Final presentations' },
  { key: 'showcase_open_at', label: 'Showcase opens' },
  { key: 'voting_open_at', label: 'Voting opens' },
  { key: 'voting_close_at', label: 'Voting closes' },
];

function formatDay(iso: string, now: Date) {
  const d = new Date(iso);
  // Year only when it differs from today's, to keep the seven cells short.
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/**
 * The program's dated milestones in order. It is a real sequence, so the
 * steps are numbered; the next upcoming milestone is marked "Next".
 */
export function ProgramTimeline({ program, now = new Date() }: { program: Program; now?: Date }) {
  const steps = MILESTONES.filter((m) => program[m.key]).map((m) => {
    const iso = program[m.key] as string;
    return { ...m, iso, past: new Date(iso) < now };
  });
  if (steps.length === 0) return null;
  const nextIndex = steps.findIndex((s) => !s.past);

  return (
    <ol className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 sm:[&>li:last-child:nth-child(odd)]:col-span-2 xl:grid-flow-col xl:auto-cols-fr xl:grid-cols-none xl:[&>li:last-child:nth-child(odd)]:col-span-1">
      {steps.map((s, i) => {
        const isNext = i === nextIndex;
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
              <time dateTime={s.iso} className={cn('block text-sm', isNext ? 'text-primary-foreground' : 'text-muted-foreground')}>
                {isNext ? `Next, ${formatDay(s.iso, now)}` : formatDay(s.iso, now)}
              </time>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
