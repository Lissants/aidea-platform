import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Page not found' };

/** Unknown URLs and missing records (notFound()) for any role. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6 py-12">
      <p className="text-sm text-muted-foreground">Error 404</p>
      <h1 className="text-2xl font-bold">We could not find that page</h1>
      <p className="text-muted-foreground">
        The link may be out of date, or the idea or review it points to may have been removed. Check the address, or go
        back to your overview.
      </p>
      <div>
        <Button asChild>
          <Link href="/">Go to your overview</Link>
        </Button>
      </div>
    </main>
  );
}
