import { Vote as VoteIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { VoteForm } from '@/components/voting/vote-form';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isDeveloper } from '@/lib/permissions';

export const metadata = { title: 'Voting' };

export default async function VotingPage() {
  const user = await getCurrentUser();
  const period = await db.queryOne<{ id: string; program_id: string }>(
    `SELECT TOP (1) * FROM voting_periods
      WHERE opens_at <= SYSDATETIMEOFFSET() AND closes_at >= SYSDATETIMEOFFSET()
      ORDER BY opens_at DESC`
  );

  if (!period) {
    return (
      <div>
        <PageHeader title="Voting" />
        <EmptyState icon={VoteIcon} title="Voting isn't open right now" description="Check back once a voting window opens." />
      </div>
    );
  }

  // Candidates are published showcase projects only (the same rows the old
  // anyone_select_published_showcase_projects policy exposed).
  const candidates = (
    await db.query<{ idea_id: string; idea_title: string | null; team_name: string | null }>(
      `SELECT sp.idea_id, i.idea_title, i.team_name
         FROM showcase_projects sp
         LEFT JOIN ideas i ON i.id = sp.idea_id
        WHERE sp.program_id = @programId AND sp.published = 1`,
      { programId: period.program_id }
    )
  ).map((p) => ({
    idea_id: p.idea_id,
    idea_title: p.idea_title ?? 'Untitled',
    team_name: p.team_name ?? '',
  }));

  // Only the caller's own ballot — never anyone else's.
  const existingVote = user
    ? await db.queryOne<{ idea_id: string }>(
        'SELECT idea_id FROM votes WHERE voting_period_id = @periodId AND voter_id = @uid',
        { periodId: period.id, uid: user.id }
      )
    : null;

  return (
    <div>
      <PageHeader title="Voting" description="Cast one vote for your favorite showcased project." action={<StatusBadge status="voting_open" />} />
      {candidates.length === 0 ? (
        <EmptyState icon={VoteIcon} title="No candidates yet" description="Showcase projects haven't been published for this cycle." />
      ) : (
        <VoteForm
          votingPeriodId={period.id}
          candidates={candidates}
          alreadyVotedIdeaId={existingVote?.idea_id}
          canDelete={!!user && isDeveloper(user.roles)}
        />
      )}
    </div>
  );
}
