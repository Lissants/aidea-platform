'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAVIGATION, type AppRole } from '@/lib/constants/navigation';
import { isActivePath } from '@/components/navigation/sidebar-nav';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

interface MobileBottomNavProps {
  /** See SidebarNav: pass the role, not NavItem[] (icons aren't serializable). */
  role: AppRole;
}

const ITEM_CLASS =
  'flex flex-1 flex-col items-center justify-center gap-1 px-1 text-xs leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

/** Mobile bottom nav — max 5 items (primaryItems + "More"), secondary destinations in a sheet. */
export function MobileBottomNav({ role }: MobileBottomNavProps) {
  const primaryItems = NAVIGATION[role].filter((i) => i.mobilePrimary);
  const moreItems = NAVIGATION[role].filter((i) => i.mobileMore);
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const items = primaryItems.slice(0, 4);
  const moreActive = moreItems.some((i) => isActivePath(pathname, i.href));

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(ITEM_CLASS, active ? 'font-semibold text-foreground' : 'text-muted-foreground')}
          >
            <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', active && 'bg-primary text-primary-foreground')}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="max-w-full truncate">{item.mobileLabel ?? item.label}</span>
          </Link>
        );
      })}
      {moreItems.length > 0 && (
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button type="button" className={cn(ITEM_CLASS, moreActive ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', moreActive && 'bg-primary text-primary-foreground')}>
                <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              </span>
              More
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto overscroll-contain">
            <SheetHeader className="text-left">
              <SheetTitle>More</SheetTitle>
            </SheetHeader>
            <ul className="divide-y py-2">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        'flex min-h-12 items-center gap-3 px-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                        active ? 'font-semibold' : ''
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </SheetContent>
        </Sheet>
      )}
    </nav>
  );
}
