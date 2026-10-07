import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth/session';
import { MIN_PASSWORD_LENGTH } from '@/lib/validation/schemas';
import { ChangePasswordForm } from './change-password-form';

export const metadata = { title: 'Change password' };

// Deliberately not behind requireCurrentPassword(): this is where a flagged
// account is sent to clear the flag.
export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  return (
    <div>
      <PageHeader title="Change password" />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{user.mustChangePassword ? 'Choose a new password to continue' : 'Your password'}</CardTitle>
          <CardDescription>Use at least {MIN_PASSWORD_LENGTH} characters.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
