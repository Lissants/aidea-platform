import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata = { title: 'Profile' };

/**
 * Read-only: name, department and title come from Active Directory at every
 * sign-in (lib/auth/provision.ts), and the password is the Windows password.
 */
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const rows = [
    { label: 'Full name', value: user.profile?.full_name },
    { label: 'Email', value: user.email },
    { label: 'Job title', value: user.profile?.job_title },
    { label: 'Department', value: user.profile?.department },
  ];

  return (
    <div>
      <PageHeader title="Profile" description="How your name and details appear across the platform." />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Your details</CardTitle>
          <CardDescription>
            These details come from your Godrej Windows account (Active Directory) and update each time you sign in.
            To correct them, contact Godrej IT.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y rounded-md border text-sm">
            {rows.map((r) => (
              <div key={r.label} className="space-y-0.5 px-3 py-2">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="break-words font-medium">{r.value || 'Not set in Active Directory'}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-muted-foreground">
            You sign in with your Windows password. To change it, press Ctrl+Alt+Del on a company PC or contact Godrej IT.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
