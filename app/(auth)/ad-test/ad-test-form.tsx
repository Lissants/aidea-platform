'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { CheckCircle2, KeyRound, Loader2, MinusCircle, PlugZap, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Step } from '@/lib/auth/ad-test';
import { checkAdConnection, testAdSignIn, type AdTestResult } from './actions';

const ICONS = {
  ok: { Icon: CheckCircle2, className: 'text-success', text: 'Passed' },
  fail: { Icon: XCircle, className: 'text-destructive', text: 'Failed' },
  skipped: { Icon: MinusCircle, className: 'text-muted-foreground', text: 'Skipped' },
} as const;

function StepRow({ step }: { step: Step }) {
  const { Icon, className, text } = ICONS[step.status];
  return (
    <li className="flex gap-3 py-2.5">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">
          {step.label} <span className="sr-only">({text})</span>
        </p>
        <p className="break-words text-sm text-muted-foreground">{step.detail}</p>
      </div>
    </li>
  );
}

export function AdTestForm({ defaultLogin }: { defaultLogin: string }) {
  const [pending, setPending] = React.useState<'connection' | 'signin' | null>(null);
  const [result, setResult] = React.useState<AdTestResult | null>(null);
  const form = useForm<{ login: string; password: string }>({ defaultValues: { login: defaultLogin, password: '' } });

  async function onCheckConnection() {
    setPending('connection');
    setResult(null);
    setResult(await checkAdConnection().finally(() => setPending(null)));
  }

  async function onSignIn(values: { login: string; password: string }) {
    setPending('signin');
    setResult(null);
    form.resetField('password');
    setResult(await testAdSignIn(values).finally(() => setPending(null)));
  }

  return (
    <div className="space-y-6">
      <form onSubmit={form.handleSubmit(onSignIn)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login">Network ID</Label>
          <Input
            id="login"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            {...form.register('login', { required: true })}
          />
          <p className="text-xs text-muted-foreground">Filled in from this PC. An email or UPN works too.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Windows password</Label>
          <Input id="password" type="password" autoComplete="current-password" {...form.register('password', { required: true })} />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" disabled={pending !== null}>
            {pending === 'signin' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Test and sign in
          </Button>
          <Button type="button" variant="outline" disabled={pending !== null} onClick={onCheckConnection}>
            {pending === 'connection' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            Check connection only
          </Button>
        </div>
      </form>

      {result && (
        <section aria-live="polite" className="space-y-3">
          <h2 className="text-sm font-semibold">Result</h2>
          <ol className="divide-y rounded-md border px-3">
            {result.steps.map((step) => (
              <StepRow key={step.label} step={step} />
            ))}
          </ol>
          {result.signedIn && (
            // Full reload (not router.push) so the proxy picks up the new session cookie.
            <Button className="w-full" onClick={() => window.location.assign(window.location.origin)}>
              Open AIdea as {result.signedIn.name || result.signedIn.email}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
