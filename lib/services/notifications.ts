'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

/** The caller's own notifications only (was notifications_select_own). */
export async function fetchNotifications(): Promise<NotificationRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  return db.query<NotificationRow>(
    `SELECT TOP (100) id, type, title, body, link, [read], created_at
       FROM notifications
      WHERE user_id = @uid
      ORDER BY created_at DESC`,
    { uid: user.id }
  );
}

export async function markNotificationRead(notificationId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' } as const;

  const { error } = await attempt(() =>
    db.execute('UPDATE notifications SET [read] = 1 WHERE id = @id AND user_id = @uid', { id: notificationId, uid: user.id })
  );

  if (error) return { error } as const;
  revalidatePath('/notifications');
  return { ok: true } as const;
}

export async function markAllNotificationsRead() {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' } as const;

  const { error } = await attempt(() =>
    db.execute('UPDATE notifications SET [read] = 1 WHERE user_id = @uid AND [read] = 0', { uid: user.id })
  );

  if (error) return { error } as const;
  revalidatePath('/notifications');
  return { ok: true } as const;
}
