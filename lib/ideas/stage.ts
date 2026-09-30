export type DerivedStage = 'draft' | 'submitted' | 'screened_pass' | 'screened_fail' | 'build' | 'no_build' | 'showcased';

/**
 * Deliberately NOT in lib/services/idea-management.ts: that file has a
 * top-level 'use server' directive, and such a module may only export
 * async server actions — a plain exported const object breaks the Next.js
 * build ("A 'use server' file can only export async functions").
 */
export const STAGE_LABEL: Record<DerivedStage, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  screened_pass: 'Screened — Passed',
  screened_fail: 'Screened — Not Passed',
  build: 'Qualified — Build',
  no_build: 'Qualified — No Build',
  showcased: 'Showcased',
};
