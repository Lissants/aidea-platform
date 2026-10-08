/**
 * The three public program stages shown on the participant timeline, each fed
 * by an existing programs date column. Any stage's date can be masked behind
 * an editable message (programs.timeline_tba, migration 0012).
 */
export const TIMELINE_STAGES = [
  { key: 'submission_close_at', label: 'Submissions Close' },
  { key: 'screening_close_at', label: 'Team Pitch to Judge Committee' },
  { key: 'final_presentation_close_at', label: 'Final Presentation to ILT' },
] as const;

export type TimelineStageKey = (typeof TIMELINE_STAGES)[number]['key'];
export type TimelineTba = Partial<Record<TimelineStageKey, { hidden: boolean; text: string }>>;

export const DEFAULT_TBA_TEXT = 'TBA';
export const TBA_TEXT_MAX = 40;

function isStageKey(value: string): value is TimelineStageKey {
  return TIMELINE_STAGES.some((s) => s.key === value);
}

/** Keeps only known stages, coerces `hidden` and trims/caps the message
 * (empty becomes "TBA"). Used on both read and write. */
export function sanitizeTimelineTba(input: unknown): TimelineTba {
  const out: TimelineTba = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isStageKey(key) || !value || typeof value !== 'object') continue;
    const { hidden, text } = value as { hidden?: unknown; text?: unknown };
    const trimmed = typeof text === 'string' ? text.trim().slice(0, TBA_TEXT_MAX) : '';
    out[key] = { hidden: hidden === true, text: trimmed || DEFAULT_TBA_TEXT };
  }
  return out;
}

/** Tolerant parse of programs.timeline_tba; bad or missing JSON masks nothing. */
export function parseTimelineTba(raw: string | null | undefined): TimelineTba {
  if (!raw) return {};
  try {
    return sanitizeTimelineTba(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** The message to show instead of a stage's date, or null when the date is visible. */
export function stageDateMask(program: { timeline_tba?: string | null }, key: TimelineStageKey): string | null {
  const entry = parseTimelineTba(program.timeline_tba)[key];
  return entry?.hidden ? entry.text : null;
}
