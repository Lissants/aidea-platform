import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import { SidebarNav } from '@/components/navigation/sidebar-nav';
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { NotificationBell } from '@/components/navigation/notification-bell';
import { AvatarMenu } from '@/components/navigation/avatar-menu';
import { RoleSwitcher } from '@/components/navigation/role-switcher';
import { DevRoleSwitcher } from '@/components/navigation/dev-role-switcher';
import { NAVIGATION, type AppRole } from '@/lib/constants/navigation';

interface AppShellProps {
  role: AppRole;
  allRoles: AppRole[];
  isSeededDemoAccount?: boolean;
  user: { name: string; email: string; avatarUrl?: string | null };
  children: React.ReactNode;
}

const Logo = () => (
  <Link href="/overview" className="flex items-center gap-2 text-sm font-semibold text-foreground">
    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
      <Lightbulb className="h-4 w-4" />
    </div>
    <span className="truncate">AIdea</span>
  </Link>
);

/**
 * Role-aware app shell. Desktop renders a persistent collapsible sidebar +
 * sticky header; mobile renders a compact top bar + bottom nav + "More"
 * sheet. Both surfaces derive their nav items from the single
 * lib/constants/navigation.ts config, keyed by `role`.
 */
export function AppShell({ role, allRoles, isSeededDemoAccount, user, children }: AppShellProps) {
  const items = NAVIGATION[role];
  const primaryItems = items.filter((i) => i.mobilePrimary);
  const moreItems = items.filter((i) => i.mobileMore);

  const showDevSwitcher = process.env.NODE_ENV !== 'production' && !!isSeededDemoAccount;

  return (
    <div className="flex min-h-screen bg-background">
      <SidebarNav items={items} logoSlot={<Logo />} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {showDevSwitcher && <DevRoleSwitcher availableRoles={allRoles} />}
            <RoleSwitcher roles={allRoles} activeRole={role} />
            <NotificationBell />
            <ThemeToggle />
            <AvatarMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
          </div>
        </header>

        <main className="flex-1 px-4 pb-20 pt-6 sm:px-6 lg:pb-10">{children}</main>

        <MobileBottomNav primaryItems={primaryItems} moreItems={moreItems} />
      </div>
    </div>
  );
}
