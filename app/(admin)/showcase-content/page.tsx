import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { GalleryHorizontalEnd } from 'lucide-react';
import { ShowcaseContentRow } from '@/components/admin/showcase-content-row';
import { PublishReadinessBar } from '@/components/admin/publish-readiness-bar';
import { fetchShowcaseQueue, publishShowcaseProjects } from '@/lib/services/showcase-content';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Showcase Content' };

export default async function ShowcaseContentPage() {
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
        <PageHeader title="Showcase Content" />
        <EmptyState icon={GalleryHorizontalEnd} title="No active program" description="There is no active program right now." />
      </div>
    );
  }

  const rows = await fetchShowcaseQueue(program.id);
  const readyCount = rows.filter((r) => r.short_description && r.short_description.trim().length > 0).length;

  async function publish() {
    'use server';
    return publishShowcaseProjects(program!.id);
  }

  return (
    <div>
      <PageHeader title="Showcase Content" description="Curate the public Project Showcase page for Build-decision ideas." />

      <PublishReadinessBar
        readyCount={readyCount}
        totalCount={rows.length}
        label="showcase entries with content"
        publishLabel="Publish Showcase Projects"
        onPublish={publish}
      />

      {rows.length === 0 ? (
        <EmptyState icon={GalleryHorizontalEnd} title="No ideas yet" description="Build-decision ideas appear here once qualifier is finalized." />
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <ShowcaseContentRow key={row.idea_id} row={row} programId={program.id} />
          ))}
        </div>
      )}
    </div>
  );
}
