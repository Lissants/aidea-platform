import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getDefaultRole } from '@/lib/constants/navigation';

export default async function RootPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/sign-in');
  }

  const defaultRole = getDefaultRole(user!.roles);

  if (!defaultRole) {
    redirect('/access-denied');
  }

  const ROLE_HOME: Record<string, string> = {
    admin: '/overview',
    mentor: '/overview',
    participant: '/overview',
    employee_voter: '/showcase',
  };

  redirect(ROLE_HOME[defaultRole!] ?? '/sign-in');
}
