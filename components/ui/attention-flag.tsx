import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * A problem with an idea's team (e.g. "Leader vacant", "Membership conflict")
 * that needs someone to act. Deliberately distinct from workflow status:
 * outlined warning tone with an alert icon, so it reads as "fix me", not
 * as a stage the idea has reached.
 */
export function AttentionFlag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn('border-warning bg-background text-warning', className)}>
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </Badge>
  );
}
