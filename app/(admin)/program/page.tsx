import { Settings2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { ProgramConfigForm } from '@/components/admin/program-config-form';
import { ProgramContentEditor } from '@/components/admin/program-content-editor';
import { ProgramResourcesPanel } from '@/components/admin/program-resources-panel';
import { fetchActiveProgram, fetchProgramContent, fetchProgramResources } from '@/lib/services/program-config';

export const metadata = { title: 'Program Configuration' };

export default async function ProgramConfigPage() {
  const program = await fetchActiveProgram();

  if (!program) {
    return (
      <div>
        <PageHeader title="Program Configuration" />
        <EmptyState icon={Settings2} title="No program yet" description="Seed or create a program to configure it here." />
      </div>
    );
  }

  const [content, resources] = await Promise.all([fetchProgramContent(program.id), fetchProgramResources(program.id)]);

  return (
    <div className="space-y-6">
      <PageHeader title="Program Configuration" description="Cycle dates, eligibility rules, FAQ, and resource files for the current program." />
      <ProgramConfigForm program={program} />
      <ProgramContentEditor programId={program.id} content={content} />
      <ProgramResourcesPanel programId={program.id} resources={resources} />
    </div>
  );
}
