'use client';

import * as React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField, fieldA11y } from '@/components/forms/form-field';
import { IMPACT_TYPE_OPTIONS } from '@/lib/constants/impact';
import { IDEA_FORM_SECTIONS, ideaFieldId, type IdeaFormIssue } from '@/lib/ideas/idea-form-issues';
import type { ImpactKind, ImpactType, SupportArea } from '@/types/database';

/** Resolves a field key to its DOM id, inline error and ARIA props. */
export type FieldLookup = (key: string, hasHint?: boolean) => {
  id: string;
  error: string | undefined;
  a11y: ReturnType<typeof fieldA11y>;
};

export function makeFieldLookup(issues: IdeaFormIssue[]): FieldLookup {
  return (key, hasHint) => {
    const id = ideaFieldId(key);
    const error = issues.find((i) => i.field === key)?.message;
    return { id, error, a11y: fieldA11y(id, { hint: hasHint, error }) };
  };
}

function focusField(fieldId: string, sectionId: string) {
  const el = document.getElementById(fieldId) ?? document.getElementById(`${sectionId}-title`);
  el?.scrollIntoView({ block: 'center' });
  el?.focus({ preventScroll: true });
}

export function FormSection({
  section,
  description,
  children,
}: {
  section: (typeof IDEA_FORM_SECTIONS)[number];
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-title`}
      className="scroll-mt-20 space-y-5 border-t pt-8 first:border-t-0 first:pt-0"
    >
      <div className="space-y-1">
        <h2 id={`${section.id}-title`} tabIndex={-1} className="text-xl font-bold outline-none">
          {section.label}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick} className="shrink-0">
      <X aria-hidden="true" />
    </Button>
  );
}

/** Focusable summary at the top of the form; each item jumps to its field. */
export function ErrorSummary({
  issues,
  summaryRef,
}: {
  issues: IdeaFormIssue[];
  summaryRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={summaryRef}
      tabIndex={-1}
      role="alert"
      aria-labelledby="idea-error-summary-title"
      className="rounded-xl border border-destructive/40 bg-destructive-soft p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <h2 id="idea-error-summary-title" className="flex items-center gap-2 font-bold">
        <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        Fix {issues.length} {issues.length === 1 ? 'field' : 'fields'} to submit your idea
      </h2>
      <ul className="mt-2 space-y-1 pl-7 text-sm">
        {issues.map((issue) => {
          const sectionId = IDEA_FORM_SECTIONS.find((s) => s.label === issue.section)?.id ?? '';
          return (
            <li key={issue.field}>
              <a
                href={`#${issue.fieldId}`}
                onClick={(e) => {
                  e.preventDefault();
                  focusField(issue.fieldId, sectionId);
                }}
                className="focus-ring underline underline-offset-4"
              >
                {issue.section}: {issue.message}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Desktop "On this page" index; marks sections that still have errors. */
export function SectionIndex({ issues }: { issues: IdeaFormIssue[] }) {
  return (
    <nav aria-label="Form sections" className="hidden lg:block">
      <div className="sticky top-20 space-y-2">
        <p className="text-sm font-semibold">On this page</p>
        <ol className="space-y-1 border-l text-sm">
          {IDEA_FORM_SECTIONS.map((s) => {
            const count = issues.filter((i) => i.section === s.label).length;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={
                    'focus-ring -ml-px flex items-center justify-between gap-2 border-l-2 border-transparent py-1 pl-3 hover:border-foreground' +
                    (count > 0 ? ' font-semibold' : '')
                  }
                >
                  {s.label}
                  {count > 0 && <span className="text-xs text-destructive">{count} to fix</span>}
                </a>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}

export interface ImpactValue {
  impact_kind: ImpactKind;
  /** Empty until the participant picks one. */
  impact_type: ImpactType | '';
  explanation: string;
  measurable_result: string;
}

export function ImpactFieldset({
  index,
  impact,
  field,
  onChange,
  onRemove,
}: {
  index: number;
  impact: ImpactValue;
  field: FieldLookup;
  onChange: (patch: Partial<ImpactValue>) => void;
  onRemove?: () => void;
}) {
  const type = field(`impacts.${index}.impact_type`);
  const explanation = field(`impacts.${index}.explanation`);
  const measurable = field(`impacts.${index}.measurable_result`, true);
  const isPrimary = impact.impact_kind === 'primary';
  return (
    <fieldset className="relative space-y-4 rounded-xl border p-4">
      <legend className="float-left min-h-11 pr-12 pt-2.5 font-bold leading-6">
        {isPrimary ? 'Primary Impact' : 'Secondary Impact'}
        {isPrimary && <span className="sr-only"> (required)</span>}
      </legend>
      {onRemove && (
        <div className="absolute right-2 top-2">
          <RemoveButton label="Remove secondary impact" onClick={onRemove} />
        </div>
      )}
      <FormField id={type.id} label="Impact Type" required error={type.error} className="clear-both">
        <Select value={impact.impact_type || undefined} onValueChange={(v) => onChange({ impact_type: v as ImpactType })}>
          <SelectTrigger {...type.a11y} aria-required>
            <SelectValue placeholder="Select an impact type" />
          </SelectTrigger>
          <SelectContent>
            {IMPACT_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField id={explanation.id} label="How will the Idea Create this Impact?" required error={explanation.error}>
        <Textarea
          {...explanation.a11y}
          aria-required
          value={impact.explanation}
          onChange={(e) => onChange({ explanation: e.target.value })}
        />
      </FormField>
      <FormField
        id={measurable.id}
        label="What Measurable Result would Show Success?"
        required
        hint="The result or indicator you expect."
        error={measurable.error}
      >
        <Input
          {...measurable.a11y}
          aria-required
          value={impact.measurable_result}
          onChange={(e) => onChange({ measurable_result: e.target.value })}
        />
      </FormField>
    </fieldset>
  );
}

export interface SupportRequestValue {
  support_area: SupportArea;
  details: string;
  reason: string;
  estimate: string;
}

const SUPPORT_AREA_OPTIONS: { value: SupportArea; label: string }[] = [
  { value: 'tools', label: 'Tools' },
  { value: 'budget', label: 'Budget' },
  { value: 'data_access', label: 'Data access' },
];

/** Hints for the support details and "why" fields, per support area. */
const SUPPORT_FIELD_COPY: Record<SupportArea, { details: string; reason: string }> = {
  tools: {
    details: 'Tools, licenses, or technology',
    reason: 'Explain how it supports project development',
  },
  budget: {
    details: 'Provide the main cost assumptions',
    reason: 'Explain how the budget supports project development',
  },
  data_access: {
    details: 'Required data and level of access',
    reason: 'Explain how the data will be used',
  },
};

export function SupportRequestFieldset({
  index,
  request,
  field,
  onChange,
  onRemove,
}: {
  index: number;
  request: SupportRequestValue;
  field: FieldLookup;
  onChange: (patch: Partial<SupportRequestValue>) => void;
  onRemove: () => void;
}) {
  const copy = SUPPORT_FIELD_COPY[request.support_area];
  const areaId = ideaFieldId(`support_requests.${index}.support_area`);
  const details = field(`support_requests.${index}.details`, true);
  const reason = field(`support_requests.${index}.reason`, true);
  const estimate = field(`support_requests.${index}.estimate`);
  return (
    <fieldset className="relative space-y-4 rounded-xl border p-4">
      <legend className="float-left min-h-11 pr-12 pt-2.5 font-bold leading-6">Support request {index + 1}</legend>
      <div className="absolute right-2 top-2">
        <RemoveButton label={`Remove support request ${index + 1}`} onClick={onRemove} />
      </div>
      <FormField id={areaId} label="Type of support" className="clear-both">
        <Select
          value={request.support_area}
          onValueChange={(v) =>
            onChange({ support_area: v as SupportArea, estimate: v === 'budget' ? request.estimate : '' })
          }
        >
          <SelectTrigger id={areaId} className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORT_AREA_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField id={details.id} label="Support details" hint={copy.details} error={details.error}>
        <Textarea {...details.a11y} value={request.details} onChange={(e) => onChange({ details: e.target.value })} />
      </FormField>
      <FormField id={reason.id} label="Why is this support needed?" hint={copy.reason} error={reason.error}>
        <Textarea {...reason.a11y} value={request.reason} onChange={(e) => onChange({ reason: e.target.value })} />
      </FormField>
      {request.support_area === 'budget' && (
        <FormField id={estimate.id} label="Estimated amount" error={estimate.error}>
          <CurrencyInput
            {...estimate.a11y}
            placeholder="0"
            value={request.estimate}
            onValueChange={(digits) => onChange({ estimate: digits })}
          />
        </FormField>
      )}
    </fieldset>
  );
}
