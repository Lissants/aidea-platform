import { STATUS_META, stageStatusKey } from '@/lib/constants/status';

export type DerivedStage = 'draft' | 'submitted' | 'screened_pass' | 'screened_fail' | 'build' | 'no_build';

const STAGES: DerivedStage[] = ['draft', 'submitted', 'screened_pass', 'screened_fail', 'build', 'no_build'];

/**
 * Deliberately NOT in lib/services/idea-management.ts: that file has a
 * top-level 'use server' directive, and such a module may only export
 * async server actions — a plain exported const object breaks the Next.js
 * build ("A 'use server' file can only export async functions").
 *
 * Labels come from the shared status vocabulary so the filter options and
 * the badges in the list can never disagree.
 */
export const STAGE_LABEL = Object.fromEntries(
  STAGES.map((s) => [s, STATUS_META[stageStatusKey(s)].label])
) as Record<DerivedStage, string>;
