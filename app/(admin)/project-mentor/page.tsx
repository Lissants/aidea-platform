import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { UserCog } from 'lucide-react';
import { ProjectMentorRow } from '@/components/admin/project-mentor-row';
import { PublishReadinessBar } from '@/components/admin/publish-readiness-bar';
import { fetchProjectMentorQueue, fetchAllMentorOptions, publishProjectMentorAssignments } from '@/lib/services/project-mentor';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Project Mentor' };

export default async function ProjectMentorPage() {
  const supabase = createClient();
  const { data: program } = await supabase
    .from('programs')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!program) {
    return (
      <div>
        <PageHeader title="Project Mentor" />
        <EmptyState icon={UserCog} title="No active program" description="There is no active program right now." />
      </div>
    );
  }

  const [rows, mentors] = await Promise.all([fetchProjectMentorQueue(program.id), fetchAllMentorOptions()]);
  const buildRows = rows.filter((r) => r.build_decision === 'build');
  const assignedCount = buildRows.filter((r) => r.assigned_mentor_id).length;

  async function publish() {
    'use server';
    return publishProjectMentorAssignments(program!.id);
  }

  return (
    <div>
      <PageHeader
        title="Project Mentor"
        description="Assign a delivery mentor to each Build idea. Saving stays internal until you publish."
      />

      <PublishReadinessBar
        readyCount={assignedCount}
        totalCount={buildRows.length}
        label="project mentor assignments"
        publishLabel="Publish Project Mentor Assignments"
        onPublish={publish}
      />

      {rows.length === 0 ? (
        <EmptyState icon={UserCog} title="No ideas yet" description="Ideas appear here once qualifier assessments are finalized." />
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <ProjectMentorRow key={row.idea_id} row={row} mentors={mentors} />
          ))}
        </div>
      )}
    </div>
  );
}
