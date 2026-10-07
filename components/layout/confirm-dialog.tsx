'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  /** When set, the confirm button stays disabled until the user types this exact text. */
  requiredConfirmationText?: string;
  /** Extra content between the description and the typed confirmation (e.g. a reason field). */
  children?: React.ReactNode;
  /** Keeps the confirm button disabled, e.g. until a required field is filled in. */
  confirmDisabled?: boolean;
}

/**
 * Wraps AlertDialog for irreversible actions. Pass `requiredConfirmationText`
 * (e.g. the idea title or "PUBLISH") for the most destructive actions —
 * publishing results, deleting an idea — to require typed confirmation.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  requiredConfirmationText,
  children,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const [typed, setTyped] = React.useState('');
  const [pending, setPending] = React.useState(false);

  const requiresTyping = !!requiredConfirmationText;
  const canConfirm = (!requiresTyping || typed === requiredConfirmationText) && !confirmDisabled;

  React.useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {requiresTyping && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-text">
              Type <span className="font-semibold">{requiredConfirmationText}</span> to confirm
            </Label>
            <Input id="confirm-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm || pending}
            className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
            onClick={async (e) => {
              e.preventDefault();
              setPending(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? 'Working…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
