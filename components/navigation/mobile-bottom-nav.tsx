'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/lib/constants/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

interface MobileBottomNavProps {
  primaryItems: NavItem[];
  moreItems: NavItem[];
}

/** Mobile bottom nav — max 5 items (primaryItems + "More"), secondary destinations in a sheet. */
export function MobileBottomNav({ primaryItems, moreItems }: MobileBottomNavProps) {
  const pathname = usePathname();
  const items = primaryItems.slice(0, 4);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t bg-card lg:hidden">
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(item.href + '/');
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 text-xs',
              active ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
      {moreItems.length > 0 && (
        <Sheet>
          <SheetTrigger asChild>
            <button className="flex flex-1 flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
              <MoreHorizontal className="h-5 w-5" />
              More
            </button>
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>More</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-3 py-4">
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex flex-col items-center gap-2 rounded-lg border p-3 text-xs text-foreground hover:bg-accent"
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </nav>
  );
}
