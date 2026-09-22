import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { ReportsCharts } from '@/components/admin/reports-charts';
import { ExportButton } from '@/components/admin/export-button';
import { fetchSubmissionFunnel, fetchReviewerWorkload, fetchVotingTurnout, fetchWinnerCategories } from '@/lib/services/reports';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Reports' };

export default async function ReportsPage() {
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
        <PageHeader title="Reports" />
        <EmptyState icon={BarChart3} title="No active program" description="There is no active program right now." />
      </div>
    );
  }

  const [funnel, workload, turnout, winners] = await Promise.all([
    fetchSubmissionFunnel(program.id),
    fetchReviewerWorkload(program.id),
    fetchVotingTurnout(program.id),
    fetchWinnerCategories(program.id),
  ]);

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Program-wide funnel, workload, turnout, and outcome visuals."
        action={<ExportButton type="submissions" label="Export submissions CSV" />}
      />
      <ReportsCharts funnel={funnel} workload={workload} turnout={turnout} winners={winners} />
    </div>
  );
}
