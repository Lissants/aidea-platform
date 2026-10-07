import * as React from 'react';
import { cn } from '@/lib/utils';

interface ContextualActionBarProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Sticky bottom bar for page-level Save/Finalize/Publish/Export actions —
 * stays reachable while scrolling long forms or tables. Below `lg` it sits
 * above the fixed mobile bottom nav (h-16 + safe area) so the actions are
 * never covered (WCAG 2.4.11).
 */
export function ContextualActionBar({ children, className }: ContextualActionBarProps) {
  return (
    <div
      className={cn(
        'sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 z-30 -mx-4 mt-6 flex flex-wrap items-center justify-end gap-2 border-t bg-background px-4 py-3 sm:-mx-6 sm:px-6 lg:bottom-0',
        className
      )}
    >
      {children}
    </div>
  );
}
