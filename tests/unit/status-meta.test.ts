import { describe, expect, it } from 'vitest';
import { STATUS_KEYS, STATUS_META, reviewRowStatusKey, reviewStatusKey, stageStatusKey } from '@/lib/constants/status';
import { STAGE_LABEL, type DerivedStage } from '@/lib/ideas/stage';

describe('status vocabulary', () => {
  it('gives every status key a label, an icon and a tone', () => {
    for (const key of STATUS_KEYS) {
      const meta = STATUS_META[key];
      expect(meta, key).toBeDefined();
      expect(meta.label.trim().length, key).toBeGreaterThan(0);
      expect(meta.icon, key).toBeTruthy();
      expect(['neutral', 'information', 'warning', 'success', 'destructive']).toContain(meta.tone);
    }
  });

  it('uses sentence case and no em dashes in labels', () => {
    for (const key of STATUS_KEYS) {
      const { label } = STATUS_META[key];
      expect(label, key).not.toMatch(/—/);
      if (label !== 'N/A') expect(label.slice(1), key).toBe(label.slice(1).toLowerCase());
    }
  });

  it('maps every review queue state to a status key', () => {
    expect(reviewStatusKey('not_started')).toBe('not_started');
    expect(reviewStatusKey('draft')).toBe('review_draft');
    expect(reviewStatusKey('submitted')).toBe('review_completed');
    expect(reviewStatusKey('reopened')).toBe('reopened');
    expect(reviewRowStatusKey('unexpected')).toBe('not_started');
  });

  it('maps every derived idea stage to a status key whose label matches the filter label', () => {
    for (const stage of Object.keys(STAGE_LABEL) as DerivedStage[]) {
      const key = stageStatusKey(stage);
      expect(STATUS_KEYS).toContain(key);
      expect(STATUS_META[key].label).toBe(STAGE_LABEL[stage]);
    }
  });
});
