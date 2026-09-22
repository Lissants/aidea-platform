import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Static bell for Phase 1/2 — later phases wire up the notifications table
 * (unread count badge, dropdown preview). Links straight to /notifications.
 */
export function NotificationBell({ unreadCount = 0 }: { unreadCount?: number }) {
  return (
    <Button variant="ghost" size="icon" asChild className="relative" aria-label="Notifications">
      <Link href="/notifications">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-destructive" />
        )}
      </Link>
    </Button>
  );
}
