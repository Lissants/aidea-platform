'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StepperStep {
  key: string;
  label: string;
}

interface StepperProps {
  steps: StepperStep[];
  currentStep: number; // 0-indexed
  onStepClick?: (index: number) => void;
  className?: string;
}

/**
 * Visual progress stepper for the idea submission wizard. Desktop shows a
 * horizontal track; mobile collapses to a compact "Step X of N" + progress
 * bar, meant to be paired with an accordion for progressive disclosure.
 */
export function Stepper({ steps, currentStep, onStepClick, className }: StepperProps) {
  return (
    <div className={className}>
      <ol className="hidden items-center gap-2 sm:flex">
        {steps.map((step, index) => {
          const state = index < currentStep ? 'complete' : index === currentStep ? 'current' : 'upcoming';
          return (
            <li key={step.key} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                disabled={!onStepClick || state === 'upcoming'}
                onClick={() => onStepClick?.(index)}
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors',
                  state === 'complete' && 'border-primary bg-primary text-primary-foreground',
                  state === 'current' && 'border-primary text-primary',
                  state === 'upcoming' && 'border-border text-muted-foreground'
                )}
              >
                {state === 'complete' ? <Check className="h-4 w-4" /> : index + 1}
              </button>
              <span
                className={cn(
                  'truncate text-sm',
                  state === 'current' ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
              {index < steps.length - 1 && <div className="mx-2 h-px flex-1 bg-border" />}
            </li>
          );
        })}
      </ol>

      <div className="sm:hidden">
        <p className="mb-2 text-sm font-medium text-foreground">
          Step {currentStep + 1} of {steps.length}: {steps[currentStep]?.label}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
