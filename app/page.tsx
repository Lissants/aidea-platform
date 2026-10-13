import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { roleHomePath } from '@/lib/constants/navigation';

export default async function RootPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/sign-in');
  }

  redirect(roleHomePath(user!.roles) ?? '/access-denied');
}
