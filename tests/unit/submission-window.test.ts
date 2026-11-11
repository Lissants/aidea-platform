import { describe, expect, it } from 'vitest';
import { submissionWindowError, submissionWindowMessage, submissionWindowState } from '@/lib/program/submission-window';

const NOW = new Date('2026-11-11T10:00:00Z');
const PAST = '2026-11-10T10:00:00Z';
const FUTURE = '2026-11-20T10:00:00Z';

describe('submissionWindowState', () => {
  it('treats empty dates as no limit', () => {
    expect(submissionWindowState({ submission_open_at: null, submission_close_at: null }, NOW)).toBe('open');
  });

  it('is open between the open and close dates', () => {
    expect(submissionWindowState({ submission_open_at: PAST, submission_close_at: FUTURE }, NOW)).toBe('open');
  });

  it('is not yet open before the open date', () => {
    expect(submissionWindowState({ submission_open_at: FUTURE, submission_close_at: null }, NOW)).toBe('not_yet_open');
  });

  it('is closed after the close date', () => {
    expect(submissionWindowState({ submission_open_at: null, submission_close_at: PAST }, NOW)).toBe('closed');
  });

  it('is closed at the exact close instant', () => {
    expect(submissionWindowState({ submission_open_at: null, submission_close_at: NOW.toISOString() }, NOW)).toBe('closed');
  });
});

describe('submissionWindowMessage', () => {
  it('names the close date', () => {
    const msg = submissionWindowMessage({ title: 'AI Challenge', submission_open_at: null, submission_close_at: PAST }, 'closed');
    expect(msg.title).toBe('Submissions are closed');
    expect(msg.description).toBe('Submissions for AI Challenge closed on 10 November 2026.');
  });

  it('hides a TBA-masked close date', () => {
    const msg = submissionWindowMessage(
      {
        title: 'AI Challenge',
        submission_open_at: null,
        submission_close_at: PAST,
        timeline_tba: '{"submission_close_at":{"hidden":true,"text":"TBA"}}',
      },
      'closed'
    );
    expect(msg.description).toBe('Submissions for AI Challenge are closed.');
  });

  it('names the open date before the window opens', () => {
    const msg = submissionWindowMessage({ title: 'AI Challenge', submission_open_at: FUTURE, submission_close_at: null }, 'not_yet_open');
    expect(msg.title).toBe('Submission is currently closed');
    expect(msg.description).toBe('Submissions for AI Challenge open on 20 November 2026.');
  });

  it('builds the save/submit error', () => {
    expect(submissionWindowError({ title: 'AI Challenge', submission_open_at: null, submission_close_at: PAST }, 'closed')).toBe(
      'Submissions for AI Challenge closed on 10 November 2026. Your idea was not saved.'
    );
  });
});
