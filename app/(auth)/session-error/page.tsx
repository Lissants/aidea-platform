import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Session error' };

export default function SessionErrorPage() {
  return (
    <Card>
      <CardHeader>
        <AlertTriangle className="mb-1 h-6 w-6 text-warning" aria-hidden="true" />
        <CardTitle>We couldn&apos;t sign you in</CardTitle>
        <CardDescription>
          Your sign-in link may have expired or already been used. Request a new one and try again.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
