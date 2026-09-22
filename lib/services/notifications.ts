'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
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

export async function fetchNotifications(): Promise<NotificationRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  return (data ?? []) as NotificationRow[];
}

export async function markNotificationRead(notificationId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' } as const;

  const supabase = await createClient();
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .eq('user_id', user.id);

  if (error) return { error: error.message } as const;
  revalidatePath('/notifications');
  return { ok: true } as const;
}

export async function markAllNotificationsRead() {
  const user = await getCurrentUser();
  if (!user) return { error: 'Not authenticated' } as const;

  const supabase = await createClient();
  const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);

  if (error) return { error: error.message } as const;
  revalidatePath('/notifications');
  return { ok: true } as const;
}
