import Link from 'next/link';
import { SidebarNav } from '@/components/navigation/sidebar-nav';
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { NotificationBell } from '@/components/navigation/notification-bell';
import { AvatarMenu } from '@/components/navigation/avatar-menu';
import { RoleSwitcher } from '@/components/navigation/role-switcher';
import { DevRoleSwitcher } from '@/components/navigation/dev-role-switcher';
import type { AppRole } from '@/lib/constants/navigation';

interface AppShellProps {
  role: AppRole;
  allRoles: AppRole[];
  isSeededDemoAccount?: boolean;
  user: { name: string; email: string; avatarUrl?: string | null };
  children: React.ReactNode;
}

/**
 * Text wordmark. "AI" is set bold and "dea" regular so the capital I can't
 * be read as a lowercase l ("Aldea") in Arial — a legibility fix for the
 * logo, not a headline accent.
 */
const Logo = () => (
  <Link
    href="/overview"
    aria-label="AIdea home"
    className="focus-ring inline-flex items-baseline font-display text-xl leading-none tracking-tight text-foreground"
  >
    <span className="font-bold">AI</span>
    <span className="font-normal">dea</span>
  </Link>
);

/**
 * Role-aware app shell. Desktop renders a persistent collapsible sidebar +
 * sticky header; mobile renders a compact top bar + bottom nav + "More"
 * sheet. Both surfaces derive their nav items from the single
 * lib/constants/navigation.ts config, keyed by `role`.
 */
export function AppShell({ role, allRoles, isSeededDemoAccount, user, children }: AppShellProps) {
  const showDevSwitcher = process.env.NODE_ENV !== 'production' && !!isSeededDemoAccount;

  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Skip to main content
      </a>

      <SidebarNav role={role} logoSlot={<Logo />} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-4 sm:px-6">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {showDevSwitcher && <DevRoleSwitcher availableRoles={allRoles} />}
            <RoleSwitcher roles={allRoles} activeRole={role} />
            <NotificationBell />
            {/* On phones the theme choice lives in the account menu to keep the bar uncluttered. */}
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <AvatarMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
          </div>
        </header>

        <main id="main" tabIndex={-1} className="flex-1 px-4 pb-28 pt-6 outline-none sm:px-6 lg:pb-10">
          {children}
        </main>

        <MobileBottomNav role={role} />
      </div>
    </div>
  );
}
