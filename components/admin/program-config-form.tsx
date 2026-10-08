'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { saveProgramConfig, setStageTimestampNow } from '@/lib/services/program-config';
import type { ProgramRow, DateField } from '@/lib/services/program-config';
import { DEFAULT_TBA_TEXT, TBA_TEXT_MAX, TIMELINE_STAGES, parseTimelineTba, type TimelineStageKey, type TimelineTba } from '@/lib/program/timeline';

const STAGE_FIELDS: { key: DateField; label: string; quickAction?: string }[] = [
  { key: 'submission_open_at', label: 'Submission opens', quickAction: 'Open submissions now' },
  { key: 'submission_close_at', label: 'Submissions Close (submission closes)', quickAction: 'Close submissions now' },
  { key: 'screening_close_at', label: 'Team Pitch to Judge Committee (screening closes)' },
  { key: 'qualifier_close_at', label: 'Qualifier closes' },
  { key: 'final_presentation_close_at', label: 'Final Presentation to ILT (final presentation closes)' },
  { key: 'showcase_open_at', label: 'Project Showcase in Townhall (showcase opens)', quickAction: 'Open showcase now' },
  { key: 'voting_open_at', label: 'Voting opens' },
  { key: 'voting_close_at', label: 'Voting closes' },
];

function isTimelineStage(key: DateField): key is TimelineStageKey {
  return TIMELINE_STAGES.some((s) => s.key === key);
}

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
  const [tba, setTba] = React.useState<TimelineTba>(() => parseTimelineTba(program.timeline_tba));
  const [pending, setPending] = React.useState(false);

  function updateTba(key: TimelineStageKey, change: Partial<{ hidden: boolean; text: string }>) {
    setTba((prev) => ({ ...prev, [key]: { hidden: false, text: DEFAULT_TBA_TEXT, ...prev[key], ...change } }));
  }

  async function handleSave() {
    setPending(true);
    const result = await saveProgramConfig(program.id, {
      title,
      description,
      timelineTba: tba,
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
              {isTimelineStage(f.key) && <TbaControl stageKey={f.key} value={tba[f.key]} onChange={(c) => updateTba(f.key as TimelineStageKey, c)} />}
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

/** Per-stage switch that hides the real date on the participant timeline
 * behind an editable message. */
function TbaControl({
  stageKey,
  value,
  onChange,
}: {
  stageKey: TimelineStageKey;
  value: { hidden: boolean; text: string } | undefined;
  onChange: (change: Partial<{ hidden: boolean; text: string }>) => void;
}) {
  const hidden = value?.hidden ?? false;
  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex items-center gap-2">
        <Switch id={`${stageKey}-tba`} checked={hidden} onCheckedChange={(checked) => onChange({ hidden: checked })} />
        <Label htmlFor={`${stageKey}-tba`} className="font-normal">
          Show as TBA to participants
        </Label>
      </div>
      {hidden && (
        <Input
          aria-label="Message shown instead of the date"
          maxLength={TBA_TEXT_MAX}
          value={value?.text ?? DEFAULT_TBA_TEXT}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder={DEFAULT_TBA_TEXT}
        />
      )}
    </div>
  );
}
