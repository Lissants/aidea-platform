'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { saveProgramConfig, setStageTimestampNow } from '@/lib/services/program-config';
import type { ProgramRow, DateField } from '@/lib/services/program-config';

const STAGE_FIELDS: { key: DateField; label: string; quickAction?: string }[] = [
  { key: 'submission_open_at', label: 'Submission opens', quickAction: 'Open submissions now' },
  { key: 'submission_close_at', label: 'Submission closes', quickAction: 'Close submissions now' },
  { key: 'screening_close_at', label: 'Screening closes' },
  { key: 'qualifier_close_at', label: 'Qualifier closes' },
  { key: 'final_presentation_close_at', label: 'Final presentation closes' },
  { key: 'showcase_open_at', label: 'Showcase opens', quickAction: 'Open showcase now' },
  { key: 'voting_open_at', label: 'Voting opens' },
  { key: 'voting_close_at', label: 'Voting closes' },
];

function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ProgramConfigForm({ program }: { program: ProgramRow }) {
  const [title, setTitle] = React.useState(program.title);
  const [description, setDescription] = React.useState(program.description ?? '');
  const [dates, setDates] = React.useState<Record<string, string>>(
    Object.fromEntries(STAGE_FIELDS.map((f) => [f.key, toLocalInput(program[f.key])]))
  );
  const [pending, setPending] = React.useState(false);

  async function handleSave() {
    setPending(true);
    const result = await saveProgramConfig(program.id, {
      title,
      description,
      ...Object.fromEntries(Object.entries(dates).map(([k, v]) => [k, v ? new Date(v).toISOString() : null])),
    });
    setPending(false);
    if ('error' in result) return toast.error(result.error);
    toast.success('Program configuration saved');
  }

  async function handleQuickAction(field: DateField) {
    const result = await setStageTimestampNow(program.id, field);
    if ('error' in result) return toast.error(result.error);
    setDates((prev) => ({ ...prev, [field]: toLocalInput(new Date().toISOString()) }));
    toast.success('Updated');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Program configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="program-title">Title</Label>
          <Input id="program-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="program-description">Description</Label>
          <Textarea id="program-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {STAGE_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={f.key}>{f.label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={f.key}
                  type="datetime-local"
                  value={dates[f.key] ?? ''}
                  onChange={(e) => setDates((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
                {f.quickAction && (
                  <Button type="button" size="sm" variant="outline" onClick={() => handleQuickAction(f.key)}>
                    Now
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <Button onClick={handleSave} disabled={pending}>
          {pending ? 'Saving…' : 'Save configuration'}
        </Button>
      </CardContent>
    </Card>
  );
}
