import { Vote } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { VotingPeriodForm } from '@/components/admin/voting-period-form';
import { TurnoutPanel } from '@/components/admin/turnout-panel';
import { fetchVotingPeriods } from '@/lib/services/voting-management';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Voting Management' };

export default async function VotingManagementPage() {
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
        <PageHeader title="Voting Management" />
        <EmptyState icon={Vote} title="No active program" description="There is no active program right now." />
      </div>
    );
  }

  const periods = await fetchVotingPeriods(program.id);
  const current = periods[0] ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title="Voting Management" description="Open and close the Favorite Project voting window and publish results." />

      <VotingPeriodForm programId={program.id} period={current} />

      {current && <TurnoutPanel programId={program.id} period={current} />}

      {periods.length > 1 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Previous voting periods</h2>
          {periods.slice(1).map((p) => (
            <TurnoutPanel key={p.id} programId={program.id} period={p} />
          ))}
        </div>
      )}
    </div>
  );
}
