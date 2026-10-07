import Link from 'next/link';
import { Vote as VoteIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { VoteForm } from '@/components/voting/vote-form';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isDeveloper } from '@/lib/permissions';
import { fetchVoteCandidates } from '@/lib/services/voting-management';

export const metadata = { title: 'Voting' };

export default async function VotingPage() {
  const user = await getCurrentUser();
  // Same program the admin manages; a period is only visible once published.
  const period = await db.queryOne<{ id: string; program_id: string }>(
    `SELECT TOP (1) vp.id, vp.program_id
       FROM voting_periods vp
      WHERE vp.voting_published = 1
        AND vp.opens_at <= SYSDATETIMEOFFSET() AND vp.closes_at >= SYSDATETIMEOFFSET()
        AND vp.program_id = (SELECT TOP (1) id FROM programs WHERE status = 'active' ORDER BY created_at DESC)
      ORDER BY vp.opens_at DESC`
  );

  if (!period) {
    const results = await db.queryOne<{ id: string }>(
      `SELECT TOP (1) vp.id FROM voting_periods vp
        WHERE vp.results_published = 1
          AND vp.program_id = (SELECT TOP (1) id FROM programs WHERE status = 'active' ORDER BY created_at DESC)`
    );
    return (
      <div>
        <PageHeader title="Voting" />
        <EmptyState
          icon={VoteIcon}
          title="Voting isn't open right now"
          description={results ? 'The latest Favorite Project results are published.' : 'Check back once a voting window opens.'}
          action={
            results ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/voting/results">See results</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  // Candidates are every idea in the final presentation stage (v_vote_candidates).
  const candidates = await fetchVoteCandidates(period.program_id);

  // Only the caller's own ballot — never anyone else's.
  const existingVote = user
    ? await db.queryOne<{ idea_id: string }>(
        'SELECT idea_id FROM votes WHERE voting_period_id = @periodId AND voter_id = @uid',
        { periodId: period.id, uid: user.id }
      )
    : null;

  return (
    <div>
      <PageHeader title="Voting" description="Cast one vote for your favorite final presentation project." action={<StatusBadge status="voting_open" />} />
      {candidates.length === 0 ? (
        <EmptyState icon={VoteIcon} title="No candidates yet" description="No ideas have reached the final presentation stage for this cycle." />
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
