'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { ShowcaseImageUpload } from '@/components/admin/showcase-image-upload';
import { saveShowcaseContent } from '@/lib/services/showcase-content';
import type { ShowcaseQueueRow } from '@/lib/services/showcase-content';

export function ShowcaseContentRow({ row, programId }: { row: ShowcaseQueueRow; programId: string }) {
  const [description, setDescription] = React.useState(row.short_description ?? '');
  const [imageUrl, setImageUrl] = React.useState<string | null>(row.image_url);
  const [pending, setPending] = React.useState(false);
  const isLocked = row.published;

  async function handleSave() {
    setPending(true);
    const result = await saveShowcaseContent(row.idea_id, programId, { short_description: description, image_url: imageUrl });
    setPending(false);
    if ('error' in result) return toast.error(result.error);
    toast.success('Showcase content saved');
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">{row.idea_title}</CardTitle>
          <p className="text-sm text-muted-foreground">{row.team_name}</p>
        </div>
        {row.published ? <StatusBadge status="published" /> : <StatusBadge status="draft" />}
      </CardHeader>
      <CardContent className="space-y-4">
        <ShowcaseImageUpload ideaId={row.idea_id} currentUrl={imageUrl} disabled={isLocked} onUploaded={setImageUrl} />
        <div className="space-y-1.5">
          <Label htmlFor={`desc-${row.idea_id}`}>Short description</Label>
          <Textarea
            id={`desc-${row.idea_id}`}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isLocked}
            placeholder="A public-facing summary shown on the Project Showcase…"
          />
        </div>
        {!isLocked && (
          <Button size="sm" onClick={handleSave} disabled={pending || description.trim().length === 0}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
