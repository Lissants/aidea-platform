import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Status tones use a soft fill + strong text of the same hue (>= 4.5:1).
 * Rendered as a <span> so badges are valid inside paragraphs and cells.
 */
const badgeVariants = cva(
  'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-semibold',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        destructive: 'border-destructive/30 bg-destructive-soft text-destructive',
        success: 'border-success/30 bg-success-soft text-success',
        warning: 'border-warning/30 bg-warning-soft text-warning',
        information: 'border-information/20 bg-information-soft text-information',
        outline: 'border-input text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
