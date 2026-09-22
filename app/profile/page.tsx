import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth/session';
import { ProfileForm } from './profile-form';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  return (
    <div>
      <PageHeader title="Profile" description="Manage how your name and details appear across the platform." />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Your details</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={user.profile} />
        </CardContent>
      </Card>
    </div>
  );
}
