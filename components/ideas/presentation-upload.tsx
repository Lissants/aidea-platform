'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PresentationLink } from '@/components/ideas/presentation-link';
import { PRESENTATION_ACCEPT, validatePresentationFile } from '@/lib/validation/presentation';
import { PRESENTATION_STAGE_META, type PresentationStage } from '@/lib/ideas/presentation-stage';

/**
 * My Ideas: upload / replace one of the idea's presentations (.pptx / .pdf,
 * 25MB). The screening slot opens once screening is published as Pass, the
 * final slot once the qualifier result is published as Build; the route
 * (app/api/ideas/[ideaId]/presentation) re-checks that, team membership and
 * that the two slots hold different files.
 */
export function PresentationUpload({
  ideaId,
  ideaTitle,
  stage,
  enabled,
  url,
  name,
}: {
  ideaId: string;
  ideaTitle: string;
  stage: PresentationStage;
  enabled: boolean;
  url: string | null;
  name: string | null;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const hintId = `presentation-hint-${stage}-${ideaId}`;
  const meta = PRESENTATION_STAGE_META[stage];
  const label = meta.label.toLowerCase();

  async function handleFile(file: File) {
    const invalid = validatePresentationFile(file);
    if (invalid) return toast.error(invalid);

    setUploading(true);
    const body = new FormData();
    body.set('file', file);
    try {
      const res = await fetch(`/api/ideas/${ideaId}/presentation?stage=${stage}`, { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(json.error ?? `Upload failed (${res.status})`);
      toast.success(`${meta.label} ${url ? 'replaced' : 'uploaded'}`);
      router.refresh();
    } catch {
      toast.error('Upload failed — check your connection and try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {url && <PresentationLink url={url} name={name} fallback={meta.label} />}
      <input
        ref={inputRef}
        type="file"
        accept={PRESENTATION_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) handleFile(file);
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!enabled || uploading}
        aria-describedby={enabled ? undefined : hintId}
        aria-label={`${url ? 'Replace' : 'Upload'} ${label} for ${ideaTitle || 'this idea'}`}
        onClick={() => inputRef.current?.click()}
      >
        <FileUp className="h-4 w-4" aria-hidden />
        {uploading ? 'Uploading…' : url ? 'Replace' : 'Upload presentation'}
      </Button>
      {!enabled && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {meta.lockedHint}
        </p>
      )}
    </div>
  );
}
