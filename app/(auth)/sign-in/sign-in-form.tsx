'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createClient } from '@/lib/supabase/client';

const passwordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const magicLinkSchema = z.object({
  email: z.string().email(),
});

export function SignInForm() {
  const [pending, setPending] = React.useState(false);
  const supabase = createClient();

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { email: '', password: '' },
  });

  const magicLinkForm = useForm<z.infer<typeof magicLinkSchema>>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: '' },
  });

  async function onPasswordSubmit(values: z.infer<typeof passwordSchema>) {
    setPending(true);
    const { error } = await supabase.auth.signInWithPassword(values);
    setPending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.location.href = '/';
  }

  async function onMagicLinkSubmit(values: z.infer<typeof magicLinkSchema>) {
    setPending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: values.email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    });
    setPending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Check your inbox for a magic sign-in link.');
  }

  return (
    <Tabs defaultValue="password" className="w-full">
      <TabsList className="mb-4 grid w-full grid-cols-2">
        <TabsTrigger value="password">Email &amp; password</TabsTrigger>
        <TabsTrigger value="magic-link">Magic link</TabsTrigger>
      </TabsList>

      <TabsContent value="password">
        <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" placeholder="you@godrejcp.com" {...passwordForm.register('email')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...passwordForm.register('password')} />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Sign in
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="magic-link">
        <form onSubmit={magicLinkForm.handleSubmit(onMagicLinkSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="magic-email">Work email</Label>
            <Input id="magic-email" type="email" placeholder="you@godrejcp.com" {...magicLinkForm.register('email')} />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send magic link
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}
