'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { saveProjectMentorAssignment } from '@/lib/services/project-mentor';
import type { ProjectMentorQueueRow, MentorOption } from '@/lib/services/project-mentor';

export function ProjectMentorRow({ row, mentors }: { row: ProjectMentorQueueRow; mentors: MentorOption[] }) {
  const [selected, setSelected] = React.useState(row.assigned_mentor_id ?? '');
  const [pending, setPending] = React.useState(false);

  if (row.build_decision !== 'build') {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{row.idea_title}</CardTitle>
            <p className="text-sm text-muted-foreground">{row.team_name}</p>
          </div>
          <Badge variant="secondary">Not Applicable</Badge>
        </CardHeader>
      </Card>
    );
  }

  async function handleSave() {
    if (!selected) return;
    setPending(true);
    const result = await saveProjectMentorAssignment(row.idea_id, selected);
    setPending(false);
    if ('error' in result) return toast.error(result.error);
    toast.success('Project mentor saved (not yet visible to the team)');
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">{row.idea_title}</CardTitle>
          <p className="text-sm text-muted-foreground">{row.team_name}</p>
        </div>
        {row.published ? <StatusBadge status="published" /> : row.assigned_mentor_id ? <StatusBadge status="awaiting_publication" /> : <StatusBadge status="waiting_assignment" />}
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={row.published}
          className="h-9 min-w-[14rem] rounded-md border border-input bg-background px-3 text-sm shadow-sm"
        >
          <option value="">Select a mentor…</option>
          {mentors.map((m) => (
            <option key={m.mentor_profile_id} value={m.mentor_profile_id}>
              {m.full_name}
            </option>
          ))}
        </select>
        {!row.published && (
          <Button size="sm" onClick={handleSave} disabled={pending || !selected}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
