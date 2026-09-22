import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { getCurrentUser, getActiveRole } from '@/lib/auth/session';

export default async function NotificationsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  const activeRole = await getActiveRole(user);
  if (!activeRole) redirect('/access-denied');

  return (
    <AppShell
      role={activeRole}
      allRoles={user.roles}
      isSeededDemoAccount={user.email.startsWith('demo@')}
      user={{ name: user.profile?.full_name ?? user.email, email: user.email, avatarUrl: user.profile?.avatar_url }}
    >
      {children}
    </AppShell>
  );
}
