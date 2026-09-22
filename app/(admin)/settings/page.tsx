import { Settings } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Settings' };

/**
 * Read-only display of non-secret platform configuration. This is
 * intentionally not an edit UI — secrets (Supabase service-role key,
 * Microsoft/SMTP credentials, CRON_SECRET) are never surfaced here and are
 * only ever set as server environment variables. See .env.example and
 * LOCAL_SETUP.md / COMPANY_SERVER_DEPLOYMENT.md for how to change them.
 */
export default function SettingsPage() {
  const rows: { label: string; value: string }[] = [
    { label: 'Allowed sign-up/sign-in email domain', value: process.env.ALLOWED_EMAIL_DOMAIN ?? 'Not set' },
    { label: 'Email provider (dev)', value: `${process.env.EMAIL_PROVIDER ?? 'smtp'} (queues to email_outbox in dev — see lib/email/adapter.ts)` },
    { label: 'Email "from" address', value: process.env.EMAIL_FROM ?? 'Not set' },
    { label: 'App URL', value: process.env.NEXT_PUBLIC_APP_URL ?? 'Not set' },
    { label: 'Cron-protected routes', value: process.env.CRON_SECRET ? 'Configured' : 'Not configured — see .env.example' },
  ];

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Platform configuration currently in effect. Secrets are never shown here — edit environment variables directly (see .env.example)."
        action={<Settings className="h-5 w-5 text-muted-foreground" />}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current configuration</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-muted-foreground">{r.label}</span>
              <span className="text-sm font-medium">{r.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <p className="mt-4 text-sm text-muted-foreground">
        To change any of these, update the corresponding environment variable and redeploy — see{' '}
        <code className="rounded bg-muted px-1 py-0.5">.env.example</code>, <code className="rounded bg-muted px-1 py-0.5">LOCAL_SETUP.md</code>, and{' '}
        <code className="rounded bg-muted px-1 py-0.5">COMPANY_SERVER_DEPLOYMENT.md</code>.
      </p>
    </div>
  );
}
