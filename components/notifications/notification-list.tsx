'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Circle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate } from '@/lib/utils';
import { markNotificationRead, markAllNotificationsRead } from '@/lib/services/notifications';
import type { NotificationRow } from '@/lib/services/notifications';
import { categorizeNotification } from '@/lib/notifications/categorize';

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'system', label: 'System' },
  { value: 'program', label: 'Program' },
  { value: 'your_ideas', label: 'Your Ideas' },
] as const;

export function NotificationList({ notifications }: { notifications: NotificationRow[] }) {
  const [tab, setTab] = React.useState<string>('all');
  const [items, setItems] = React.useState(notifications);

  const filtered = tab === 'all' ? items : items.filter((n) => categorizeNotification(n.type) === tab);
  const unreadCount = items.filter((n) => !n.read).length;

  async function handleMarkRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    const result = await markNotificationRead(id);
    if ('error' in result) toast.error(result.error);
  }

  async function handleMarkAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    const result = await markAllNotificationsRead();
    if ('error' in result) toast.error(result.error);
    else toast.success('All notifications marked as read');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            Mark all as read ({unreadCount})
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {filtered.map((n) => {
          const content = (
            <CardContent className="flex items-start justify-between gap-4 p-4">
              <div className="flex items-start gap-2">
                {!n.read && <Circle className="mt-1.5 h-2 w-2 shrink-0 fill-primary text-primary" />}
                <div>
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="text-xs text-muted-foreground">{formatDate(n.created_at)}</span>
                {!n.read && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={(e) => {
                      e.preventDefault();
                      handleMarkRead(n.id);
                    }}
                  >
                    Mark as read
                  </Button>
                )}
              </div>
            </CardContent>
          );

          return (
            <Card key={n.id} className={!n.read ? 'border-primary/40' : undefined}>
              {n.link ? (
                <Link href={n.link} onClick={() => !n.read && handleMarkRead(n.id)} className="block">
                  {content}
                </Link>
              ) : (
                content
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
