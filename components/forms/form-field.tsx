import * as React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * ARIA wiring for a control rendered inside <FormField>. Spread onto the
 * input/textarea/select trigger so hint and error text are announced.
 */
export function fieldA11y(id: string, { hint, error }: { hint?: React.ReactNode; error?: string }) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ');
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  } as const;
}

interface FormFieldProps {
  id: string;
  label: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

/** Label + optional hint + control + inline error, in that order. */
export function FormField({ id, label, required, hint, error, className, children }: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="font-semibold">
        {label}
        {required && (
          <>
            <span className="ml-0.5 text-destructive" aria-hidden="true">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </Label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
