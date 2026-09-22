import { Vote as VoteIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { VoteForm } from '@/components/voting/vote-form';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';

export const metadata = { title: 'Voting' };

export default async function VotingPage() {
  const user = await getCurrentUser();
  const supabase = createClient();

  const now = new Date().toISOString();
  const { data: period } = await supabase
    .from('voting_periods')
    .select('*')
    .lte('opens_at', now)
    .gte('closes_at', now)
    .order('opens_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!period) {
    return (
      <div>
        <PageHeader title="Voting" />
        <EmptyState icon={VoteIcon} title="Voting isn't open right now" description="Check back once a voting window opens." />
      </div>
    );
  }

  const { data: showcaseProjects } = await supabase
    .from('showcase_projects')
    .select('idea_id, ideas(idea_title, team_name)')
    .eq('program_id', period.program_id)
    .eq('published', true);

  const candidates = (showcaseProjects ?? []).map((p: any) => ({
    idea_id: p.idea_id,
    idea_title: p.ideas?.idea_title ?? 'Untitled',
    team_name: p.ideas?.team_name ?? '',
  }));

  const { data: existingVote } = user
    ? await supabase
        .from('votes')
        .select('idea_id')
        .eq('voting_period_id', period.id)
        .eq('voter_id', user.id)
        .maybeSingle()
    : { data: null };

  return (
    <div>
      <PageHeader title="Voting" description="Cast one vote for your favorite showcased project." action={<StatusBadge status="voting_open" />} />
      {candidates.length === 0 ? (
        <EmptyState icon={VoteIcon} title="No candidates yet" description="Showcase projects haven't been published for this cycle." />
      ) : (
        <VoteForm votingPeriodId={period.id} candidates={candidates} alreadyVotedIdeaId={existingVote?.idea_id} />
      )}
    </div>
  );
}
