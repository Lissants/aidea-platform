import { Badge } from '@/components/ui/badge';
import { STATUS_META, type StatusKey, type StatusTone } from '@/lib/constants/status';
import { cn } from '@/lib/utils';

const TONE_TO_BADGE_VARIANT: Record<StatusTone, 'secondary' | 'destructive' | 'success' | 'warning' | 'information'> = {
  neutral: 'secondary',
  information: 'information',
  warning: 'warning',
  success: 'success',
  destructive: 'destructive',
};

/**
 * The single status badge component for the whole app. Status is never
 * conveyed by color alone — every badge pairs an icon and a text label with
 * its color, per the design system requirements. "Quiet" statuses (the
 * absence of a result, e.g. N/A) render as muted text instead of a badge.
 */
export function StatusBadge({ status, className }: { status: StatusKey; className?: string }) {
  const meta = STATUS_META[status];
  if (!meta) return null;
  const Icon = meta.icon;
  if (meta.quiet) {
    return <span className={cn('text-sm text-muted-foreground', className)}>{meta.label}</span>;
  }
  return (
    <Badge variant={TONE_TO_BADGE_VARIANT[meta.tone]} className={className}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{meta.label}</span>
    </Badge>
  );
}
