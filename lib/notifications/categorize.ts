export type NotificationCategory = 'program' | 'your_ideas' | 'system';

/**
 * Buckets a notification's `type` into one of the three filter tabs the
 * Notifications center exposes. Adapt here, not in the page, whenever a
 * new notification type is introduced.
 *
 * Deliberately NOT in lib/services/notifications.ts: that file has a
 * top-level 'use server' directive, and such a module may only export
 * async server actions — this plain sync helper is imported directly by a
 * Client Component, so it has to live in its own ordinary module.
 */
export function categorizeNotification(type: string): NotificationCategory {
  if (['voting_opened', 'voting_closing_reminder', 'voting_result_published'].includes(type)) return 'program';
  if (['published', 'review_reopened', 'reviewer_assigned'].includes(type)) return 'your_ideas';
  return 'system'; // e.g. routing_required (admin escalation)
}
