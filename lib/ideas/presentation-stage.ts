/**
 * The two presentation slots on an idea:
 *  - screening: uploaded once the screening result is published as Pass
 *    (ideas.screening_presentation_*, db/migrations/0017)
 *  - final: uploaded once the qualifier result is published as Build
 *    (ideas.presentation_*, db/migrations/0010)
 * Both go through app/api/ideas/[ideaId]/presentation, which refuses the
 * same file in both slots.
 */
export type PresentationStage = 'screening' | 'final';

export const PRESENTATION_STAGES = ['screening', 'final'] as const satisfies readonly PresentationStage[];

export function parsePresentationStage(value: unknown): PresentationStage | null {
  if (value === null || value === undefined || value === '') return 'final';
  return value === 'screening' || value === 'final' ? value : null;
}

export const PRESENTATION_STAGE_META: Record<
  PresentationStage,
  { label: string; columns: { url: string; name: string; uploadedAt: string; uploadedBy: string }; lockedHint: string; lockedError: string }
> = {
  screening: {
    label: 'Screening presentation',
    columns: {
      url: 'screening_presentation_url',
      name: 'screening_presentation_name',
      uploadedAt: 'screening_presentation_uploaded_at',
      uploadedBy: 'screening_presentation_uploaded_by',
    },
    lockedHint: 'Available once your idea passes screening',
    lockedError: 'Uploads open once Admin passes your idea at screening.',
  },
  final: {
    label: 'Final presentation',
    columns: {
      url: 'presentation_url',
      name: 'presentation_name',
      uploadedAt: 'presentation_uploaded_at',
      uploadedBy: 'presentation_uploaded_by',
    },
    lockedHint: 'Available once your idea is marked Build',
    lockedError: 'Uploads open once your idea is marked Build.',
  },
};

export function otherPresentationStage(stage: PresentationStage): PresentationStage {
  return stage === 'screening' ? 'final' : 'screening';
}

export function duplicatePresentationError(stage: PresentationStage) {
  const other = PRESENTATION_STAGE_META[otherPresentationStage(stage)].label.toLowerCase();
  return `This is the same file as your ${other}. Upload a different deck.`;
}
