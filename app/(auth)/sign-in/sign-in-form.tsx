'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { signInWithPassword } from '@/lib/auth/actions';
import { safeRedirectPath } from '@/lib/auth/redirect';

const passwordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

function MicrosoftLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 21 21" className="h-4 w-4">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function SignInForm({
  microsoftEnabled,
  passwordEnabled,
  redirectTo,
}: {
  microsoftEnabled: boolean;
  passwordEnabled: boolean;
  redirectTo?: string;
}) {
  const [pending, setPending] = React.useState(false);
  // With Microsoft available, the password form is a fallback behind a toggle.
  const [showPassword, setShowPassword] = React.useState(!microsoftEnabled);
  const target = safeRedirectPath(redirectTo);

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onPasswordSubmit(values: z.infer<typeof passwordSchema>) {
    setPending(true);
    const result = await signInWithPassword(values);
    if ('error' in result) {
      setPending(false);
      toast.error(result.error);
      return;
    }
    // Full reload (not router.push) so the proxy and Server Components pick up
    // the new session cookie on the very next request.
    window.location.assign(`${window.location.origin}${target}`);
  }

  const passwordFields = (
    <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" type="email" autoComplete="username" placeholder="you@godrejcp.com" {...passwordForm.register('email')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" {...passwordForm.register('password')} />
      </div>
      <Button type="submit" variant={microsoftEnabled ? 'outline' : 'default'} className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Sign in
      </Button>
    </form>
  );

  return (
    <div className="space-y-4">
      {microsoftEnabled && (
        <Button asChild className="w-full" disabled={pending}>
          <a href={`/auth/microsoft?redirect_to=${encodeURIComponent(target)}`}>
            <MicrosoftLogo />
            Sign in with Microsoft
          </a>
        </Button>
      )}

      {microsoftEnabled && passwordEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Separator className="flex-1" />
            or
            <Separator className="flex-1" />
          </div>
          {!showPassword && (
            <Button type="button" variant="ghost" className="w-full" onClick={() => setShowPassword(true)}>
              <KeyRound className="h-4 w-4" />
              Sign in with password instead
            </Button>
          )}
        </>
      )}

      {passwordEnabled && showPassword && passwordFields}
    </div>
  );
}
