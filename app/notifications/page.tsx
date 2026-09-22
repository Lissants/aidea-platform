import { Bell } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { NotificationList } from '@/components/notifications/notification-list';
import { fetchNotifications } from '@/lib/services/notifications';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const notifications = await fetchNotifications();

  return (
    <div>
      <PageHeader title="Notifications" description="Program updates relevant to you." />
      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet" description="You're all caught up." />
      ) : (
        <NotificationList notifications={notifications} />
      )}
    </div>
  );
}
