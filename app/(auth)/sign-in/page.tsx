import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignInForm } from './sign-in-form';

export const metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AIdea Submission Platform</CardTitle>
        <CardDescription>Sign in to the AI Innovation Challenge with your Godrej work email.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm />
      </CardContent>
    </Card>
  );
}
