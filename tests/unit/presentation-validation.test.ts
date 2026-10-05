import { describe, expect, it } from 'vitest';
import {
  MAX_PRESENTATION_BYTES,
  PRESENTATION_TYPES,
  sniffPresentationType,
  validatePresentationFile,
} from '@/lib/validation/presentation';

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);

describe('validatePresentationFile', () => {
  it('accepts .pdf and .pptx within the size limit', () => {
    expect(validatePresentationFile({ name: 'deck.PDF', size: 1000 })).toBeNull();
    expect(validatePresentationFile({ name: 'deck.pptx', size: MAX_PRESENTATION_BYTES })).toBeNull();
  });

  it('rejects other extensions, empty and oversized files', () => {
    expect(validatePresentationFile({ name: 'deck.ppt', size: 1000 })).toMatch(/pptx or \.pdf/);
    expect(validatePresentationFile({ name: 'deck', size: 1000 })).toMatch(/pptx or \.pdf/);
    expect(validatePresentationFile({ name: 'deck.pdf', size: 0 })).toMatch(/empty/);
    expect(validatePresentationFile({ name: 'deck.pdf', size: MAX_PRESENTATION_BYTES + 1 })).toMatch(/25MB/);
  });
});

describe('sniffPresentationType', () => {
  it('returns the content type when bytes match the extension', () => {
    expect(sniffPresentationType(PDF, 'a.pdf')).toBe(PRESENTATION_TYPES.pdf);
    expect(sniffPresentationType(ZIP, 'a.pptx')).toBe(PRESENTATION_TYPES.pptx);
  });

  it('rejects renamed or mismatched files', () => {
    expect(() => sniffPresentationType(bytes(0x68, 0x69), 'a.pdf')).toThrow(/pptx or \.pdf/);
    expect(() => sniffPresentationType(PDF, 'a.pptx')).toThrow();
    expect(() => sniffPresentationType(ZIP, 'a.docx')).toThrow();
  });
});
