import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Access denied' };

export default function AccessDeniedPage() {
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <ShieldAlert className="mb-2 h-10 w-10 text-destructive" />
        <CardTitle>Access denied</CardTitle>
        <CardDescription>
          Your account doesn&apos;t have the role required to view that page. If you believe this is a
          mistake, contact your program administrator.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
