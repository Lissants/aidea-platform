import { describe, expect, it } from 'vitest';
import {
  PRESENTATION_STAGE_META,
  duplicatePresentationError,
  otherPresentationStage,
  parsePresentationStage,
} from '@/lib/ideas/presentation-stage';

describe('parsePresentationStage', () => {
  it('defaults to the final presentation so existing uploads keep working', () => {
    expect(parsePresentationStage(null)).toBe('final');
    expect(parsePresentationStage(undefined)).toBe('final');
    expect(parsePresentationStage('')).toBe('final');
  });

  it('accepts the two known stages and rejects anything else', () => {
    expect(parsePresentationStage('screening')).toBe('screening');
    expect(parsePresentationStage('final')).toBe('final');
    expect(parsePresentationStage('Screening')).toBeNull();
    expect(parsePresentationStage('presentation_url = NULL --')).toBeNull();
  });
});

describe('presentation stage metadata', () => {
  it('maps each stage to its own ideas columns', () => {
    expect(PRESENTATION_STAGE_META.screening.columns.url).toBe('screening_presentation_url');
    expect(PRESENTATION_STAGE_META.final.columns.url).toBe('presentation_url');
    expect(PRESENTATION_STAGE_META.screening.label).toBe('Qualifier Presentation');
    expect(PRESENTATION_STAGE_META.final.label).toBe('Final Presentation');
  });

  it('names the other slot in the duplicate-file error', () => {
    expect(otherPresentationStage('screening')).toBe('final');
    expect(otherPresentationStage('final')).toBe('screening');
    expect(duplicatePresentationError('screening')).toContain('Final Presentation');
    expect(duplicatePresentationError('final')).toContain('Qualifier Presentation');
  });
});
