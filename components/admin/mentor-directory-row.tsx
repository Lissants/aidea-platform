'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { updateMentorCapacity } from '@/lib/services/mentors';
import type { MentorDirectoryRow } from '@/lib/services/mentors';

export function MentorDirectoryRow({ mentor }: { mentor: MentorDirectoryRow }) {
  const [capacity, setCapacity] = React.useState(String(mentor.max_capacity));
  const [pending, setPending] = React.useState(false);
  const pct = mentor.max_capacity > 0 ? Math.round((mentor.active_count / mentor.max_capacity) * 100) : 0;

  async function handleSave() {
    const n = Number(capacity);
    setPending(true);
    const result = await updateMentorCapacity(mentor.mentor_profile_id, n);
    setPending(false);
    if ('error' in result) return toast.error(result.error);
    toast.success('Capacity updated');
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{mentor.full_name}</p>
          <p className="text-xs text-muted-foreground">{mentor.email}</p>
          {mentor.expertise && <p className="mt-1 text-xs text-muted-foreground">Expertise: {mentor.expertise}</p>}
          <div className="mt-2 flex items-center gap-2">
            <Progress value={pct} className="max-w-[160px]" />
            <span className="text-xs text-muted-foreground">
              {mentor.active_count} / {mentor.max_capacity} active
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className="w-20" />
          <Button size="sm" variant="outline" onClick={handleSave} disabled={pending}>
            Save
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/review-assignment?mentor=${mentor.mentor_profile_id}`}>View queue</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
