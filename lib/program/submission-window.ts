import { stageDateMask } from '@/lib/program/timeline';

/**
 * Whether ideas can be created, edited or submitted right now. An empty
 * date means no limit on that side (no open date = already open, no close
 * date = never closes). The close date is an exact cutoff: at that instant
 * submissions are closed. Nobody is exempt; admins move the dates instead.
 */
export type SubmissionWindowState = 'not_yet_open' | 'open' | 'closed';

export interface SubmissionWindowProgram {
  title?: string | null;
  submission_open_at: string | Date | null;
  submission_close_at: string | Date | null;
  timeline_tba?: string | null;
}

export function submissionWindowState(program: SubmissionWindowProgram, now: Date = new Date()): SubmissionWindowState {
  if (program.submission_open_at && new Date(program.submission_open_at) > now) return 'not_yet_open';
  if (program.submission_close_at && new Date(program.submission_close_at) <= now) return 'closed';
  return 'open';
}

function longDate(value: string | Date) {
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function programName(program: SubmissionWindowProgram) {
  return program.title ? `Submissions for ${program.title}` : 'Submissions';
}

/** Card title and description for a window that is not open. */
export function submissionWindowMessage(
  program: SubmissionWindowProgram,
  state: Exclude<SubmissionWindowState, 'open'>
): { title: string; description: string } {
  if (state === 'not_yet_open') {
    return {
      title: 'Submission is currently closed',
      description: program.submission_open_at
        ? `${programName(program)} open on ${longDate(program.submission_open_at)}.`
        : 'Check back once submissions open.',
    };
  }
  // A close date the admin hid behind TBA is never revealed here.
  const masked = stageDateMask({ timeline_tba: program.timeline_tba ?? null }, 'submission_close_at');
  return {
    title: 'Submissions are closed',
    description:
      !masked && program.submission_close_at
        ? `${programName(program)} closed on ${longDate(program.submission_close_at)}.`
        : `${programName(program)} are closed.`,
  };
}

/** One-line error for the save/submit actions when the window is not open. */
export function submissionWindowError(program: SubmissionWindowProgram, state: Exclude<SubmissionWindowState, 'open'>) {
  return `${submissionWindowMessage(program, state).description} Your idea was not saved.`;
}
