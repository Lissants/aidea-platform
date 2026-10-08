import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Access denied' };

export default function AccessDeniedPage() {
  return (
    <Card>
      <CardHeader>
        <ShieldAlert className="mb-1 h-6 w-6 text-destructive" aria-hidden="true" />
        <CardTitle>Access denied</CardTitle>
        <CardDescription>
          Your account doesn&apos;t have the role required to view that page. If you believe this is a
          mistake, contact your program administrator.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
