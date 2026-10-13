import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Session error' };

/** Plain-English copy for each `reason` the Microsoft callback can return. */
const REASONS: Record<string, string> = {
  sso_disabled: 'Microsoft sign-in is not set up for AIdea yet. Sign in with your email and password instead.',
  sso_cancelled: 'Microsoft sign-in was cancelled or not approved. Try again when you are ready.',
  sso_state: 'Your sign-in took too long or was opened in another tab. Start again from the sign-in page.',
  sso_exchange: 'Microsoft could not confirm your sign-in. Try again; if it keeps happening, contact the AIdea team.',
  sso_claims: 'Your Microsoft account did not share an email address with AIdea. Contact the AIdea team.',
  sso_tenant: 'Sign in with your Godrej Microsoft work account, not a personal or external account.',
  domain_not_allowed: 'This email address is not allowed to use AIdea. Sign in with your Godrej work account.',
  account_deactivated: 'Your AIdea account has been deactivated. Contact the AIdea team if you think this is a mistake.',
};

const FALLBACK = 'Your sign-in could not be completed. Go back to the sign-in page and try again.';

export default async function SessionErrorPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <AlertTriangle className="mb-1 h-6 w-6 text-warning" aria-hidden="true" />
        <CardTitle>We couldn&apos;t sign you in</CardTitle>
        <CardDescription>{(reason && REASONS[reason]) || FALLBACK}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
