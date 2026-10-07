import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  /** States the situation ("You have no ideas yet"). */
  title: string;
  /** Tells the person what happens next or what to do. */
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Left-aligned (GIG rule) empty state: situation, direction, optional action. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex gap-4 rounded-xl border border-dashed px-5 py-6', className)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold text-foreground">{title}</p>
        {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
        {action && <div className="pt-3">{action}</div>}
      </div>
    </div>
  );
}
