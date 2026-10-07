export const MAX_PRESENTATION_BYTES = 25 * 1024 * 1024;

export const PRESENTATION_TYPES = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const;

export const PRESENTATION_ACCEPT = `.pptx,.pdf,${PRESENTATION_TYPES.pdf},${PRESENTATION_TYPES.pptx}`;

const TYPE_ERROR = 'Only .pptx or .pdf files are allowed.';

function extensionOf(name: string) {
  return name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
}

/**
 * Client-side pre-check (extension + size) for the My Ideas upload button.
 * The server re-checks the bytes with sniffPresentationType — never trust this alone.
 */
export function validatePresentationFile(file: { name: string; size: number }): string | null {
  const ext = extensionOf(file.name);
  if (ext !== 'pdf' && ext !== 'pptx') return TYPE_ERROR;
  if (file.size === 0) return 'File is empty.';
  if (file.size > MAX_PRESENTATION_BYTES) return 'Presentation must be 25MB or smaller.';
  return null;
}

/**
 * Server-side check that the bytes match the extension: PDFs start with
 * `%PDF-`, .pptx files are ZIP containers (`PK\x03\x04`). Returns the content
 * type to store, or throws with a user-presentable message.
 */
export function sniffPresentationType(buf: Uint8Array, name: string): string {
  const ext = extensionOf(name);
  const startsWith = (bytes: number[]) => buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);
  if (ext === 'pdf' && startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return PRESENTATION_TYPES.pdf;
  if (ext === 'pptx' && startsWith([0x50, 0x4b, 0x03, 0x04])) return PRESENTATION_TYPES.pptx;
  throw new Error(TYPE_ERROR);
}
