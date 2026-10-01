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
import type { MyIdeaRow } from '@/types/database';

export const metadata = { title: 'My Ideas' };

// Drafts have no results yet ("-"); a submitted idea with nothing published
// shows N/A.
const NONE = <span className="text-muted-foreground">-</span>;

export default async function MyIdeasPage() {
  const user = await getCurrentUser();
  // Results are only exposed once published (published = 1); the CASEs return
  // NULL otherwise, which renders as N/A. Mentor is N/A for Not Build ideas.
  // internal_reason, recommendations and scores are deliberately not selected.
  const ideas = user
    ? await db.query<MyIdeaRow>(
        `SELECT i.*,
                CASE WHEN sd.published = 1 THEN sd.decision END AS screening,
                CASE WHEN qa.published = 1 THEN qa.build_decision END AS qualifier,
                CASE WHEN pma.published = 1 AND ISNULL(qa.build_decision, '') <> 'no_build' THEN pr.full_name END AS mentor_name
           FROM ideas i
           LEFT JOIN screening_decisions sd ON sd.idea_id = i.id
           LEFT JOIN qualifier_assessments qa ON qa.idea_id = i.id
           LEFT JOIN project_mentor_assignments pma ON pma.idea_id = i.id
           LEFT JOIN mentor_profiles mp ON mp.id = pma.mentor_profile_id
           LEFT JOIN profiles pr ON pr.id = mp.profile_id
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
    {
      key: 'screening',
      header: 'Screening',
      cell: (row) =>
        row.status !== 'submitted' ? (
          NONE
        ) : (
          <StatusBadge
            status={row.screening === 'pass_to_qualifier' ? 'pass' : row.screening === 'not_pass' ? 'not_pass' : 'not_applicable'}
          />
        ),
    },
    {
      key: 'qualifier',
      header: 'Qualifier',
      cell: (row) =>
        row.status !== 'submitted' ? (
          NONE
        ) : (
          <StatusBadge status={row.qualifier === 'build' ? 'build' : row.qualifier === 'no_build' ? 'no_build' : 'not_applicable'} />
        ),
    },
    {
      key: 'mentor',
      header: 'Project Mentor',
      cell: (row) => (row.status !== 'submitted' ? NONE : (row.mentor_name ?? 'N/A')),
    },
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
