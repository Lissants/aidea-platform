import * as React from 'react';
import { cn } from '@/lib/utils';

interface ContextualActionBarProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Sticky bottom bar for page-level Save/Finalize/Publish/Export actions —
 * stays reachable while scrolling long forms or tables.
 */
export function ContextualActionBar({ children, className }: ContextualActionBarProps) {
  return (
    <div
      className={cn(
        'sticky bottom-0 left-0 z-30 -mx-4 mt-6 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6',
        className
      )}
    >
      {children}
    </div>
  );
}
