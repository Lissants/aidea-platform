import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { getCurrentUser, getActiveRole } from '@/lib/auth/session';

/**
 * This route group also serves the shared pages employee voters use
 * (Showcase, Voting, Results, Notifications) — so any authenticated user
 * with at least one recognized role can enter here. Participant-only pages
 * (My Ideas, Submit) additionally check `role === 'participant'` in-page.
 */
export default async function ParticipantLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  if (user.roles.length === 0) redirect('/access-denied');

  const activeRole = getActiveRole(user) ?? user.roles[0];

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
