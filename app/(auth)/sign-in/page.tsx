import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isMicrosoftSsoEnabled } from '@/lib/auth/microsoft';
import { SignInForm } from './sign-in-form';

export const metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_to?: string }>;
}) {
  const { redirect_to } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle>AIdea Submission Platform</CardTitle>
        <CardDescription>Sign in to the AI Innovation Challenge with your Godrej work email.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm microsoftEnabled={isMicrosoftSsoEnabled()} redirectTo={redirect_to} />
      </CardContent>
    </Card>
  );
}
