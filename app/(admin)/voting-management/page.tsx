import { Vote } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { NoActiveProgram } from '@/components/layout/no-active-program';
import { EmptyState } from '@/components/layout/empty-state';
import { VotingPeriodForm } from '@/components/admin/voting-period-form';
import { TurnoutPanel } from '@/components/admin/turnout-panel';
import { fetchVotingPeriods } from '@/lib/services/voting-management';
import { db } from '@/lib/db';

export const metadata = { title: 'Voting Management' };

export default async function VotingManagementPage() {
  const program = await db.queryOne<{ id: string }>(
    "SELECT TOP (1) id FROM programs WHERE status = 'active' ORDER BY created_at DESC"
  );

  if (!program) {
    return (
      <div>
        <PageHeader title="Voting Management" />
        <NoActiveProgram audience="admin" />
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
