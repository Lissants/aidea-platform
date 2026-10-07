import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { requireCurrentPassword } from '@/lib/auth/password-gate';
import { getCurrentUser, getActiveRole } from '@/lib/auth/session';
import { isAdmin, isMentor } from '@/lib/permissions';

export default async function MentorLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  requireCurrentPassword(user);
  if (!isMentor(user.roles) && !isAdmin(user.roles)) redirect('/access-denied');

  const activeRole = (await getActiveRole(user)) ?? 'mentor';

  return (
    <AppShell
      role={activeRole === 'admin' || activeRole === 'developer' ? activeRole : 'mentor'}
      allRoles={user.roles}
      isSeededDemoAccount={user.email.startsWith('demo@')}
      user={{ name: user.profile?.full_name ?? user.email, email: user.email, avatarUrl: user.profile?.avatar_url }}
    >
      {children}
    </AppShell>
  );
}
