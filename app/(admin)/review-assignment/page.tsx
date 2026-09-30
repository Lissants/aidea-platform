import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { AlertTriangle } from 'lucide-react';
import { RoutingQueueTable } from '@/components/admin/routing-queue-table';
import { fetchRoutingQueue, fetchMentorCapacities } from '@/lib/services/review-assignment';
import { db } from '@/lib/db';

export const metadata = { title: 'Review Assignment' };

export default async function ReviewAssignmentPage() {
  const program = await db.queryOne<{ id: string }>(
    `SELECT TOP (1) id FROM programs WHERE status = 'active' ORDER BY created_at DESC`
  );

  if (!program) {
    return (
      <div>
        <PageHeader title="Review Assignment" />
        <EmptyState icon={AlertTriangle} title="No active program" description="There is no active program right now." />
      </div>
    );
  }

  const [rows, mentors] = await Promise.all([fetchRoutingQueue(program.id), fetchMentorCapacities(program.id)]);

  return (
    <div>
      <PageHeader
        title="Review Assignment"
        description="Ideas needing manual routing, plus every current assignment and mentor capacity."
      />
      <RoutingQueueTable rows={rows} mentors={mentors} />
    </div>
  );
}
