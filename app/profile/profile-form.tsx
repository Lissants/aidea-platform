'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { profileSchema, type ProfileInput } from '@/lib/validation/schemas';
import { updateProfile } from '@/lib/services/profile';
import type { Profile } from '@/types/database';

export function ProfileForm({ profile }: { profile: Profile | null }) {
  const [pending, setPending] = React.useState(false);
  const { register, handleSubmit } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: profile?.full_name ?? '',
      job_title: profile?.job_title ?? '',
      department: profile?.department ?? '',
    },
  });

  async function onSubmit(values: ProfileInput) {
    setPending(true);
    const result = await updateProfile(values);
    setPending(false);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    toast.success('Profile updated');
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="full_name">Full name</Label>
        <Input id="full_name" {...register('full_name')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="job_title">Job title</Label>
        <Input id="job_title" {...register('job_title')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="department">Department</Label>
        <Input id="department" {...register('department')} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
