import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { NextStep } from '@/lib/overview/next-step';

/**
 * The one expressive moment on each role's home: the next step, set large as
 * the page's H1, with one plain sentence and at most one action.
 */
export function NextStepHeader({ eyebrow, step }: { eyebrow: string; step: NextStep }) {
  return (
    <header className="space-y-3 border-b pb-8">
      <p className="text-sm text-muted-foreground">{eyebrow}</p>
      <h1 className="max-w-[24ch] text-balance font-display text-2xl font-bold leading-tight sm:text-[2rem] sm:leading-[2.5rem]">
        {step.title}
      </h1>
      <p className="max-w-prose text-base text-muted-foreground">{step.body}</p>
      {step.action && (
        <Button asChild className="mt-2">
          <Link href={step.action.href}>{step.action.label}</Link>
        </Button>
      )}
    </header>
  );
}
