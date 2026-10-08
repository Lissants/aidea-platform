'use client';

import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Pencil, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MentorAvatar } from '@/components/mentors/mentor-avatar';
import { updateMentorProfile, type MentorDirectoryRow } from '@/lib/services/mentors';
import { uploadFile } from '@/lib/storage/upload-client';
import { validateImage } from '@/lib/validation/image';
import { MAX_MENTOR_EXPERTISE_CHARS, mentorProfileSchema, type MentorProfileInput } from '@/lib/validation/schemas';

function defaults(mentor: MentorDirectoryRow): MentorProfileInput {
  return { job_title: mentor.job_title ?? '', expertise: mentor.expertise ?? '', photo_url: mentor.photo_url };
}

/** Admin edit of what everyone sees on the Mentor Profile page. */
export function EditMentorProfileDialog({ mentor }: { mentor: MentorDirectoryRow }) {
  const [open, setOpen] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const form = useForm<MentorProfileInput>({ resolver: zodResolver(mentorProfileSchema), defaultValues: defaults(mentor) });
  const { errors, isSubmitting } = form.formState;
  const photoUrl = useWatch({ control: form.control, name: 'photo_url' });
  const expertiseLength = (useWatch({ control: form.control, name: 'expertise' }) ?? '').length;

  function handleOpenChange(next: boolean) {
    if (next) form.reset(defaults(mentor));
    setOpen(next);
  }

  async function handleFile(file: File) {
    const validationError = validateImage({ size: file.size, type: file.type });
    if (validationError) return toast.error(validationError);
    setUploading(true);
    const result = await uploadFile('mentor-photos', mentor.mentor_profile_id, file);
    setUploading(false);
    if ('error' in result) return toast.error(result.error);
    form.setValue('photo_url', result.url, { shouldDirty: true });
  }

  async function onSubmit(values: MentorProfileInput) {
    const result = await updateMentorProfile(mentor.mentor_profile_id, values);
    if ('error' in result) return toast.error(result.error);
    toast.success('Mentor profile updated');
    setOpen(false);
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => handleOpenChange(true)}>
        <Pencil className="h-4 w-4" />
        Edit profile
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit mentor profile</DialogTitle>
            <DialogDescription>
              {[mentor.full_name, mentor.email, mentor.department].filter(Boolean).join(' · ')}. Shown to everyone on the
              Mentor Profile page.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex items-center gap-4">
              <MentorAvatar name={mentor.full_name} photoUrl={photoUrl} size="lg" />
              <div className="flex flex-wrap gap-2">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) handleFile(file);
                  }}
                />
                <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? 'Uploading…' : photoUrl ? 'Replace photo' : 'Upload photo'}
                </Button>
                {photoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploading}
                    onClick={() => form.setValue('photo_url', null, { shouldDirty: true })}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                )}
                <p className="w-full text-xs text-muted-foreground">PNG, JPEG or WebP, up to 5MB. A square photo works best.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mentor-job-title">Title</Label>
              <Input id="mentor-job-title" placeholder="e.g. Senior Manager, Data & AI" {...form.register('job_title')} />
              {errors.job_title && <p className="text-xs text-destructive">{errors.job_title.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mentor-expertise">Expertise</Label>
              <Textarea
                id="mentor-expertise"
                rows={6}
                maxLength={MAX_MENTOR_EXPERTISE_CHARS}
                placeholder="A short paragraph about this mentor's areas of expertise."
                {...form.register('expertise')}
              />
              <div className="flex justify-between gap-2">
                <p className="text-xs text-destructive">{errors.expertise?.message}</p>
                <p className="text-xs text-muted-foreground">
                  {expertiseLength}/{MAX_MENTOR_EXPERTISE_CHARS}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || uploading}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
