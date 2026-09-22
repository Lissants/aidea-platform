import { describe, expect, it } from 'vitest';
import { categorizeNotification } from '@/lib/notifications/categorize';

describe('categorizeNotification', () => {
  it('buckets voting lifecycle events as program', () => {
    expect(categorizeNotification('voting_opened')).toBe('program');
    expect(categorizeNotification('voting_closing_reminder')).toBe('program');
    expect(categorizeNotification('voting_result_published')).toBe('program');
  });

  it('buckets idea/review outcomes as your_ideas', () => {
    expect(categorizeNotification('published')).toBe('your_ideas');
    expect(categorizeNotification('review_reopened')).toBe('your_ideas');
    expect(categorizeNotification('reviewer_assigned')).toBe('your_ideas');
  });

  it('falls back to system for anything else (e.g. admin escalations)', () => {
    expect(categorizeNotification('routing_required')).toBe('system');
    expect(categorizeNotification('some_future_type')).toBe('system');
  });
});
