import Link from 'next/link';
import { Lightbulb, PlusCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Button } from '@/components/ui/button';
import { ResponsiveTable, type ResponsiveTableColumn } from '@/components/ui/responsive-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { PUBLISHED_RESULTS_SELECT, publishedResultsJoins } from '@/lib/ideas/published-results';
import { resultColumns } from '@/components/ideas/result-columns';
import type { MyIdeaRow } from '@/types/database';

export const metadata = { title: 'My Ideas' };

export default async function MyIdeasPage() {
  const user = await getCurrentUser();
  // Visible to the creator, team leader and team members. Results are
  // published-only (see lib/ideas/published-results.ts).
  const ideas = user
    ? await db.query<MyIdeaRow>(
        `SELECT i.*, ${PUBLISHED_RESULTS_SELECT}
           FROM ideas i
           ${publishedResultsJoins('i')}
          WHERE i.created_by = @uid
             OR i.team_leader_id = @uid
             OR EXISTS (SELECT 1 FROM idea_team_members m WHERE m.idea_id = i.id AND m.profile_id = @uid)
          ORDER BY i.created_at DESC`,
        { uid: user.id }
      )
    : [];

  const columns: ResponsiveTableColumn<MyIdeaRow>[] = [
    { key: 'idea_title', header: 'Idea', cell: (row) => row.idea_title },
    { key: 'team_name', header: 'Team', cell: (row) => row.team_name },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status === 'submitted' ? 'submitted' : 'draft'} />,
    },
    ...resultColumns<MyIdeaRow>((row) => row.status !== 'submitted'),
    { key: 'updated_at', header: 'Last updated', cell: (row) => formatDate(row.updated_at) },
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
      <ResponsiveTable
        columns={columns}
        data={ideas}
        getRowKey={(row) => row.id}
        emptyState={
          <EmptyState
            icon={Lightbulb}
            title="No ideas yet"
            description="Start your first AI Innovation Challenge submission."
            action={
              <Button asChild>
                <Link href="/submit">Submit New Idea</Link>
              </Button>
            }
          />
        }
      />
    </div>
  );
}
