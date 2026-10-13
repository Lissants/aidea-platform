import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isAdEnabled } from '@/lib/auth/ldap';
import { isMicrosoftSsoEnabled, isPasswordSignInEnabled } from '@/lib/auth/microsoft';
import { postSignInPath } from '@/lib/auth/post-sign-in';
import { getCurrentUser } from '@/lib/auth/session';
import { SignInForm } from './sign-in-form';

export const metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_to?: string }>;
}) {
  const { redirect_to } = await searchParams;
  // Already signed in (e.g. arriving from a Grove link): go straight to the app.
  const user = await getCurrentUser();
  if (user) redirect(await postSignInPath(user.id, redirect_to));

  const ldapEnabled = isAdEnabled();
  return (
    <Card>
      <CardHeader>
        <CardTitle>AIdea Submission Platform</CardTitle>
        <CardDescription>
          {ldapEnabled
            ? 'Sign in to the AI Innovation Challenge with your Godrej Windows account.'
            : 'Sign in to the AI Innovation Challenge with your Godrej work email.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm
          microsoftEnabled={isMicrosoftSsoEnabled()}
          passwordEnabled={isPasswordSignInEnabled()}
          directoryEnabled={ldapEnabled}
          redirectTo={redirect_to}
        />
      </CardContent>
    </Card>
  );
}
