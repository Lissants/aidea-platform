import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { getCurrentUser, getActiveRole } from '@/lib/auth/session';
import { hasAnyRole } from '@/lib/permissions';

export default async function MentorLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  if (!hasAnyRole(user.roles, ['mentor', 'admin'])) redirect('/access-denied');

  const activeRole = (await getActiveRole(user)) ?? 'mentor';

  return (
    <AppShell
      role={activeRole === 'admin' ? 'admin' : 'mentor'}
      allRoles={user.roles}
      isSeededDemoAccount={user.email.startsWith('demo@')}
      user={{ name: user.profile?.full_name ?? user.email, email: user.email, avatarUrl: user.profile?.avatar_url }}
    >
      {children}
    </AppShell>
  );
}
