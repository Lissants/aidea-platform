'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAVIGATION, type AppRole, type NavItem } from '@/lib/constants/navigation';
import { Button } from '@/components/ui/button';

interface SidebarNavProps {
  /** Only the role crosses the server→client boundary; nav items carry icon
   *  components (functions), which cannot be serialized as props. */
  role: AppRole;
  logoSlot: React.ReactNode;
}

/** Consecutive items sharing a `group` become one titled section. */
function toSections(items: NavItem[]) {
  const sections: { group?: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = sections[sections.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else sections.push({ group: item.group, items: [item] });
  }
  return sections;
}

export function isActivePath(pathname: string | null, href: string) {
  return pathname === href || !!pathname?.startsWith(href + '/');
}

/** Persistent, collapsible desktop left sidebar. */
export function SidebarNav({ role, logoSlot }: SidebarNavProps) {
  const sections = toSections(NAVIGATION[role]);
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-background transition-[width] duration-150 lg:flex',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-14 items-center justify-between border-b px-4">
        {!collapsed && logoSlot}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto p-2">
        {sections.map((section, i) => (
          <div key={section.group ?? `top-${i}`} className={cn(i > 0 && 'mt-4')}>
            {section.group &&
              (collapsed ? (
                <hr className="mx-2 mb-2" />
              ) : (
                <p className="px-3 pb-1 text-xs font-semibold text-muted-foreground">{section.group}</p>
              ))}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'bg-primary font-semibold text-primary-foreground'
                          : 'text-foreground hover:bg-accent'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
