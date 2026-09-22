import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { AlertTriangle } from 'lucide-react';
import { RoutingQueueTable } from '@/components/admin/routing-queue-table';
import { fetchRoutingQueue, fetchMentorCapacities } from '@/lib/services/review-assignment';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Review Assignment' };

export default async function ReviewAssignmentPage() {
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
