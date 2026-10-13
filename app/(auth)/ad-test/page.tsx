import { notFound } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { adTestEnabled, adTestSettings, machineLogin } from '@/lib/auth/ad-test';
import { AdTestForm } from './ad-test-form';

export const metadata = { title: 'AD connection test' };

/**
 * Developer check for on-prem AD sign-in (lib/auth/ad-test.ts). 404 in
 * production builds, so it can never become a password-guessing page.
 */
export default function AdTestPage() {
  if (!adTestEnabled()) notFound();
  const settings = adTestSettings();

  const rows = [
    { label: 'Domain controller', value: settings.url ? `${settings.url} (from ${settings.urlSource})` : 'Not found' },
    { label: 'Base DN', value: settings.baseDn ? `${settings.baseDn} (from LDAP_BASE_DN)` : 'Read from the domain controller' },
    {
      label: 'CA certificate',
      value: settings.caLoaded
        ? `Loaded from ${settings.caPath}`
        : settings.caPath
          ? `Can't read ${settings.caPath}`
          : 'LDAP_CA_CERT_PATH not set (Node trusts only public CAs)',
    },
    {
      label: 'Lookup',
      value: settings.serviceAccount
        ? 'Service account looks you up, then checks your password'
        : 'Signs in to AD as you, then reads your own record (no service account set)',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>AD connection test</CardTitle>
        <CardDescription>
          Signs you in to AIdea with your Windows account through Active Directory. Developer check: it only runs
          under npm run dev.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="divide-y rounded-md border text-sm">
          {rows.map((r) => (
            <div key={r.label} className="space-y-0.5 px-3 py-2">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="break-words font-medium">{r.value}</dd>
            </div>
          ))}
        </dl>
        <AdTestForm defaultLogin={machineLogin()} />
      </CardContent>
    </Card>
  );
}
