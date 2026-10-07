'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const MAX_DIGITS = 15;

export function formatDigits(digits: string): string {
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
}

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'prefix'> {
  /** Raw digits only, e.g. "1000000". */
  value: string;
  onValueChange: (digits: string) => void;
  prefix?: string;
}

/** Digits-only amount input that renders thousands separators as the user types. */
const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, prefix = 'IDR', className, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);
    const caretDigits = React.useRef<number | null>(null);
    const display = formatDigits(value);

    // Restore the caret by counting digits to its left, since commas shift positions.
    React.useLayoutEffect(() => {
      const el = innerRef.current;
      const target = caretDigits.current;
      if (!el || target === null || document.activeElement !== el) return;
      caretDigits.current = null;
      let pos = 0;
      let seen = 0;
      while (pos < display.length && seen < target) {
        if (display[pos] !== ',') seen++;
        pos++;
      }
      el.setSelectionRange(pos, pos);
    }, [display]);

    return (
      <div
        className={cn(
          'flex h-9 w-full items-center rounded-md border border-input bg-background text-sm shadow-sm focus-within:ring-1 focus-within:ring-ring',
          className
        )}
      >
        <span className="select-none border-r px-3 text-muted-foreground" aria-hidden="true">
          {prefix}
        </span>
        <input
          ref={innerRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-right tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          value={display}
          onChange={(e) => {
            const raw = e.target.value;
            const caret = e.target.selectionStart ?? raw.length;
            caretDigits.current = raw.slice(0, caret).replace(/\D/g, '').length;
            const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS);
            if (digits === value) {
              // Rejected keystroke (e.g. a letter): re-render so the DOM reverts.
              e.target.value = display;
              caretDigits.current = null;
              return;
            }
            onValueChange(digits);
          }}
          {...props}
        />
      </div>
    );
  }
);
CurrencyInput.displayName = 'CurrencyInput';

export { CurrencyInput };
