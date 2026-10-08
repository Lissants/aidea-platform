import Link from 'next/link';
import { CalendarOff } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { Button } from '@/components/ui/button';

const COPY = {
  admin: {
    title: 'No program is active',
    description: 'Activate a program to open submissions, reviews and decisions.',
  },
  mentor: {
    title: 'No program is active',
    description: 'Ideas routed to you will appear here once a program is running.',
  },
  participant: {
    title: 'No program is open right now',
    description: 'When the next AI Innovation Challenge opens you can submit ideas here. Watch your notifications.',
  },
} as const;

/** The one "no active program" message, phrased for the person reading it. */
export function NoActiveProgram({ audience }: { audience: keyof typeof COPY }) {
  const copy = COPY[audience];
  return (
    <EmptyState
      icon={CalendarOff}
      title={copy.title}
      description={copy.description}
      action={
        audience === 'admin' ? (
          <Button asChild variant="outline">
            <Link href="/program">Go to Program</Link>
          </Button>
        ) : undefined
      }
    />
  );
}
