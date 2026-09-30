import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  if (!isAdmin(user.roles)) redirect('/access-denied');

  return (
    <AppShell
      role="admin"
      allRoles={user.roles}
      isSeededDemoAccount={user.email.startsWith('demo@')}
      user={{ name: user.profile?.full_name ?? user.email, email: user.email, avatarUrl: user.profile?.avatar_url }}
    >
      {children}
    </AppShell>
  );
}
