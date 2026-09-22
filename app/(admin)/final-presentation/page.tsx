import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Presentation } from 'lucide-react';
import { FinalPresentationRow } from '@/components/admin/final-presentation-row';
import { PublishReadinessBar } from '@/components/admin/publish-readiness-bar';
import {
  fetchFinalPresentationQueue,
  fetchTakenCategories,
  publishFinalPresentationResults,
} from '@/lib/services/final-presentation';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Final Presentation' };

export default async function FinalPresentationPage() {
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
        <PageHeader title="Final Presentation" />
        <EmptyState icon={Presentation} title="No active program" description="There is no active program right now." />
      </div>
    );
  }

  const [rows, takenCategories] = await Promise.all([
    fetchFinalPresentationQueue(program.id),
    fetchTakenCategories(program.id),
  ]);
  const finalizedCount = rows.filter((r) => r.status === 'finalized').length;

  async function publish() {
    'use server';
    return publishFinalPresentationResults(program!.id);
  }

  return (
    <div>
      <PageHeader title="Final Presentation" description="Score final presentations and decide winners." />

      <PublishReadinessBar
        readyCount={finalizedCount}
        totalCount={rows.length}
        label="final presentation assessments finalized"
        publishLabel="Publish Final Presentation Results"
        onPublish={publish}
      />

      {rows.length === 0 ? (
        <EmptyState icon={Presentation} title="No ideas yet" description="Only Build-decision ideas reach final presentation." />
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <FinalPresentationRow key={row.idea_id} row={row} takenCategories={takenCategories} />
          ))}
        </div>
      )}
    </div>
  );
}
