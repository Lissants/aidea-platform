import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Gavel } from 'lucide-react';
import { ScreeningRow } from '@/components/admin/screening-row';
import { PublishReadinessBar } from '@/components/admin/publish-readiness-bar';
import { fetchScreeningQueue, publishScreeningDecisions } from '@/lib/services/screening';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Screening Decision' };

export default async function ScreeningPage() {
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
        <PageHeader title="Screening Decision" />
        <EmptyState icon={Gavel} title="No active program" description="There is no active program right now." />
      </div>
    );
  }

  const rows = await fetchScreeningQueue(program.id);
  const decidedCount = rows.filter((r) => r.decision !== null).length;

  async function publish() {
    'use server';
    return publishScreeningDecisions(program!.id);
  }

  return (
    <div>
      <PageHeader title="Screening Decision" description="Review mentor recommendations and decide which ideas advance to the qualifier stage." />

      <PublishReadinessBar readyCount={decidedCount} totalCount={rows.length} label="screening decisions" publishLabel="Publish All Screening Results" onPublish={publish} />

      {rows.length === 0 ? (
        <EmptyState icon={Gavel} title="Nothing to screen yet" description="Ideas appear here once their mentor review is submitted." />
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <ScreeningRow key={row.idea_id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
