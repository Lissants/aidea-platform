'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { FileUp, Trash2, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { addProgramResource, deleteProgramResource } from '@/lib/services/program-config';
import type { ProgramResourceRow } from '@/lib/services/program-config';

const MAX_BYTES = 10 * 1024 * 1024;

export function ProgramResourcesPanel({ programId, resources }: { programId: string; resources: ProgramResourceRow[] }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error('File must be 10MB or smaller');
      return;
    }
    setUploading(true);
    const supabase = createClient();
    const path = `${programId}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('program-resources').upload(path, file, { upsert: true });
    if (error) {
      setUploading(false);
      toast.error(error.message);
      return;
    }
    const { data: publicUrl } = supabase.storage.from('program-resources').getPublicUrl(path);
    const result = await addProgramResource(programId, file.name, publicUrl.publicUrl, file.type || null);
    setUploading(false);
    if ('error' in result) return toast.error(result.error);
    toast.success('Resource uploaded');
  }

  async function handleDelete(id: string) {
    const result = await deleteProgramResource(id);
    if ('error' in result) return toast.error(result.error);
    toast.success('Resource removed');
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Resource files</CardTitle>
        <div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <Button size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <FileUp className="h-4 w-4" />
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {resources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No resource files yet.</p>
        ) : (
          resources.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
              <a href={r.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm hover:underline">
                <FileText className="h-4 w-4" /> {r.title}
              </a>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
