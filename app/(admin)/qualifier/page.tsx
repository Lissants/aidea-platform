import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { FileCheck2 } from 'lucide-react';
import { QualifierRow } from '@/components/admin/qualifier-row';
import { PublishReadinessBar } from '@/components/admin/publish-readiness-bar';
import { fetchQualifierQueue, publishQualifierResults } from '@/lib/services/qualifier';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Idea Qualifier' };

export default async function QualifierPage() {
  const supabase = await createClient();
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
        <PageHeader title="Idea Qualifier" />
        <EmptyState icon={FileCheck2} title="No active program" description="There is no active program right now." />
      </div>
    );
  }

  const rows = await fetchQualifierQueue(program.id);
  const finalizedCount = rows.filter((r) => r.status === 'finalized').length;

  async function publish() {
    'use server';
    return publishQualifierResults(program!.id);
  }

  return (
    <div>
      <PageHeader title="Idea Qualifier" description="Score ideas that passed screening and decide Build / No Build." />

      <PublishReadinessBar
        readyCount={finalizedCount}
        totalCount={rows.length}
        label="qualifier assessments finalized"
        publishLabel="Publish All Qualifier Results"
        onPublish={publish}
      />

      {rows.length === 0 ? (
        <EmptyState icon={FileCheck2} title="No ideas yet" description="Ideas appear here once they pass screening." />
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <QualifierRow key={row.idea_id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
