'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TempPasswordDialog } from '@/components/admin/temp-password-dialog';
import { TIER_LABELS, type UserTier } from '@/lib/constants/navigation';
import { createUser } from '@/lib/services/users';
import { createUserSchema, type CreateUserInput } from '@/lib/validation/schemas';

export function AddUserDialog({ tiers }: { tiers: UserTier[] }) {
  const [open, setOpen] = React.useState(false);
  const [created, setCreated] = React.useState<{ email: string; password: string } | null>(null);

  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', fullName: '', employeeId: '', tier: 'participant', tempPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: CreateUserInput) {
    const result = await createUser(values);
    if ('error' in result) return toast.error(result.error);
    toast.success('User created');
    setOpen(false);
    form.reset();
    setCreated({ email: values.email, password: result.tempPassword });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={tiers.length === 0}>
        <UserPlus className="h-4 w-4" />
        Add user
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              They sign in with a temporary password and must choose their own straight away.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-fullName">Full name</Label>
              <Input id="add-fullName" {...form.register('fullName')} />
              {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-email">Work email</Label>
              <Input id="add-email" type="email" placeholder="name@godrejcp.com" {...form.register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="add-employeeId">Employee ID (optional)</Label>
                <Input id="add-employeeId" {...form.register('employeeId')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-tier">Role</Label>
                <select id="add-tier" className="h-9 w-full rounded-md border bg-background px-2 text-sm" {...form.register('tier')}>
                  {tiers.map((t) => (
                    <option key={t} value={t}>
                      {TIER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-password">Temporary password (optional)</Label>
              <Input
                id="add-password"
                type="text"
                autoComplete="off"
                placeholder="Leave blank to generate one"
                {...form.register('tempPassword')}
              />
              {errors.tempPassword && <p className="text-xs text-destructive">{errors.tempPassword.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Create user
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <TempPasswordDialog password={created?.password ?? null} email={created?.email ?? ''} onClose={() => setCreated(null)} />
    </>
  );
}
