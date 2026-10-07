import Link from 'next/link';
import { Lightbulb, PlusCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Button } from '@/components/ui/button';
import { ResponsiveTable, type ResponsiveTableColumn } from '@/components/ui/responsive-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/session';
import { fetchMyIdeas } from '@/lib/ideas/my-ideas';
import { resultColumns } from '@/components/ideas/result-columns';
import { CommitIdeaPanel } from '@/components/ideas/commit-idea-panel';
import { PresentationUpload } from '@/components/ideas/presentation-upload';
import { PresentationLink } from '@/components/ideas/presentation-link';
import { AttentionFlag } from '@/components/ui/attention-flag';
import { fetchMyMembershipConflicts } from '@/lib/services/team-membership';
import type { MyIdeaRow } from '@/types/database';

const ROLE_LABEL: Record<MyIdeaRow['my_role'], string> = {
  leader: 'Team leader',
  member: 'Team member',
  creator: 'Creator (not on team)',
};

export const metadata = { title: 'My Ideas' };

export default async function MyIdeasPage() {
  const user = await getCurrentUser();
  // Visible to the creator, team leader and team members. Results are
  // published-only (see lib/ideas/published-results.ts).
  const [ideas, conflicts] = await Promise.all([user ? fetchMyIdeas(user.id) : [], fetchMyMembershipConflicts()]);

  const columns: ResponsiveTableColumn<MyIdeaRow>[] = [
    {
      key: 'idea_title',
      header: 'Idea',
      mobile: 'title',
      cell: (row) => row.idea_title || <span className="text-muted-foreground">Untitled draft</span>,
    },
    { key: 'team_name', header: 'Team', cell: (row) => row.team_name },
    { key: 'my_role', header: 'Your role', cell: (row) => ROLE_LABEL[row.my_role] },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={row.status === 'submitted' ? 'submitted' : 'draft'} />
          {row.status === 'submitted' && !row.team_leader_id && (
            <AttentionFlag>Leader vacant</AttentionFlag>
          )}
        </div>
      ),
    },
    ...resultColumns<MyIdeaRow>((row) => row.status !== 'submitted'),
    {
      key: 'presentation',
      header: 'Presentation',
      // Only the team can upload (a creator who left the team just sees the file).
      cell: (row) =>
        row.my_role === 'creator' ? (
          row.presentation_url ? (
            <PresentationLink url={row.presentation_url} name={row.presentation_name} />
          ) : (
            <span className="text-muted-foreground">-</span>
          )
        ) : (
          <PresentationUpload
            ideaId={row.id}
            ideaTitle={row.idea_title}
            enabled={row.qualifier === 'build'}
            url={row.presentation_url}
            name={row.presentation_name}
          />
        ),
    },
    { key: 'updated_at', header: 'Last updated', mobile: 'hidden', cell: (row) => formatDate(row.updated_at) },
  ];

  return (
    <div>
      <PageHeader
        title="My Ideas"
        description="Drafts and submitted ideas you own, lead or are a team member of."
        action={
          <Button asChild>
            <Link href="/submit">
              <PlusCircle className="h-4 w-4" /> Submit New Idea
            </Link>
          </Button>
        }
      />
      <CommitIdeaPanel conflicts={conflicts} />
      <ResponsiveTable
        columns={columns}
        data={ideas}
        getRowKey={(row) => row.id}
        emptyState={
          <EmptyState
            icon={Lightbulb}
            title="You have no ideas yet"
            description="Ideas you create, lead or are added to as a team member appear here."
            action={
              <Button asChild>
                <Link href="/submit">Submit a new idea</Link>
              </Button>
            }
          />
        }
      />
    </div>
  );
}
