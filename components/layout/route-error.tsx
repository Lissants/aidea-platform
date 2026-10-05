'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shared body for route-level error.tsx boundaries: says what happened in
 * plain words and offers a retry (re-renders the segment) and a way home.
 */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    console.error(error);
    headingRef.current?.focus();
  }, [error]);

  return (
    <div className="max-w-xl space-y-4 py-6">
      <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
        This page could not be loaded
      </h1>
      <p className="text-muted-foreground">
        Something went wrong while fetching its data. Try again; if it keeps happening, contact the program team and
        quote the reference below.
      </p>
      {error.digest && (
        <p className="text-sm text-muted-foreground">
          Reference: <code className="font-semibold text-foreground">{error.digest}</code>
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Go to your overview</Link>
        </Button>
      </div>
    </div>
  );
}
