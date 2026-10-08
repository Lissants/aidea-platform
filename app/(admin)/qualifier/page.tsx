import { PageHeader } from '@/components/layout/page-header';
import { NoActiveProgram } from '@/components/layout/no-active-program';
import { EmptyState } from '@/components/layout/empty-state';
import { FileCheck2 } from 'lucide-react';
import { QualifierRow } from '@/components/admin/qualifier-row';
import { PublishReadinessBar } from '@/components/admin/publish-readiness-bar';
import { fetchQualifierQueue, publishQualifierResults } from '@/lib/services/qualifier';
import { db } from '@/lib/db';

export const metadata = { title: 'Idea Qualifier' };

export default async function QualifierPage() {
  const program = await db.queryOne<{ id: string }>(
    `SELECT TOP (1) id FROM programs WHERE status = 'active' ORDER BY created_at DESC`
  );

  if (!program) {
    return (
      <div>
        <PageHeader title="Idea Qualifier" />
        <NoActiveProgram audience="admin" />
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
