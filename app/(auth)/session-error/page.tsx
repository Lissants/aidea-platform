import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Session error' };

export default function SessionErrorPage() {
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <AlertTriangle className="mb-2 h-10 w-10 text-warning" />
        <CardTitle>We couldn&apos;t sign you in</CardTitle>
        <CardDescription>
          Your sign-in link may have expired or already been used. Request a new one and try again.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button asChild>
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
