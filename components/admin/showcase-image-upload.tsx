'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadFile } from '@/lib/storage/upload-client';
import { validateShowcaseImage } from '@/lib/validation/showcase-image';

export function ShowcaseImageUpload({
  ideaId,
  currentUrl,
  disabled,
  onUploaded,
}: {
  ideaId: string;
  currentUrl: string | null;
  disabled?: boolean;
  onUploaded: (url: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  async function handleFile(file: File) {
    const validationError = validateShowcaseImage({ size: file.size, type: file.type });
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setUploading(true);
    const result = await uploadFile('showcase-images', ideaId, file);
    setUploading(false);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    onUploaded(result.url);
  }

  return (
    <div className="flex items-center gap-3">
      {currentUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentUrl} alt="Showcase preview" className="h-16 w-16 rounded-md object-cover" />
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={disabled || uploading} onClick={() => inputRef.current?.click()}>
        <Upload className="h-4 w-4" />
        {uploading ? 'Uploading…' : currentUrl ? 'Replace image' : 'Upload image'}
      </Button>
    </div>
  );
}
