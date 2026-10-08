import { describe, expect, it } from 'vitest';
import { DEFAULT_TBA_TEXT, TBA_TEXT_MAX, TIMELINE_STAGES, parseTimelineTba, sanitizeTimelineTba, stageDateMask } from '@/lib/program/timeline';

describe('TIMELINE_STAGES', () => {
  it('lists the four public stages in order', () => {
    expect(TIMELINE_STAGES.map((s) => s.label)).toEqual([
      'Submissions Close',
      'Team Pitch to Judge Committee',
      'Final Presentation to ILT',
      'Project Showcase in Townhall',
    ]);
  });
});

describe('parseTimelineTba', () => {
  it('masks nothing for missing or broken JSON', () => {
    expect(parseTimelineTba(null)).toEqual({});
    expect(parseTimelineTba('not json')).toEqual({});
    expect(parseTimelineTba('[1,2]')).toEqual({});
  });

  it('reads a stored per-stage entry', () => {
    expect(parseTimelineTba('{"screening_close_at":{"hidden":true,"text":"Coming soon"}}')).toEqual({
      screening_close_at: { hidden: true, text: 'Coming soon' },
    });
  });
});

describe('sanitizeTimelineTba', () => {
  it('drops unknown stages and coerces hidden', () => {
    expect(sanitizeTimelineTba({ voting_close_at: { hidden: true, text: 'x' }, showcase_open_at: { hidden: 'yes', text: 'Soon' } })).toEqual({
      showcase_open_at: { hidden: false, text: 'Soon' },
    });
  });

  it('falls back to TBA for empty text and caps long text', () => {
    const out = sanitizeTimelineTba({
      submission_close_at: { hidden: true, text: '   ' },
      final_presentation_close_at: { hidden: true, text: 'x'.repeat(100) },
    });
    expect(out.submission_close_at?.text).toBe(DEFAULT_TBA_TEXT);
    expect(out.final_presentation_close_at?.text).toHaveLength(TBA_TEXT_MAX);
  });
});

describe('stageDateMask', () => {
  const timeline_tba = JSON.stringify({
    submission_close_at: { hidden: true, text: 'TBA' },
    screening_close_at: { hidden: false, text: 'Later' },
  });

  it('returns the message only for hidden stages', () => {
    expect(stageDateMask({ timeline_tba }, 'submission_close_at')).toBe('TBA');
    expect(stageDateMask({ timeline_tba }, 'screening_close_at')).toBeNull();
    expect(stageDateMask({ timeline_tba: null }, 'submission_close_at')).toBeNull();
  });
});
