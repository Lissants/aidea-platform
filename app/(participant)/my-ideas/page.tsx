import Link from 'next/link';
import { Lightbulb, Pencil, PlusCircle } from 'lucide-react';
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
import { db } from '@/lib/db';
import { submissionWindowState } from '@/lib/program/submission-window';
import type { MyIdeaRow, Program } from '@/types/database';

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
  const [ideas, conflicts, program] = await Promise.all([
    user ? fetchMyIdeas(user.id) : [],
    fetchMyMembershipConflicts(),
    db.queryOne<Program>(`SELECT TOP (1) * FROM programs WHERE status = 'active' ORDER BY created_at DESC`),
  ]);

  // Outside the submission window nothing can be started or continued
  // (same rule as /submit and saveIdeaDraft). No active program: no window.
  const windowState = program ? submissionWindowState(program) : 'closed';
  const submissionOpen = windowState === 'open';

  // Only the creator can keep editing a draft (same rule as saveIdeaDraft).
  const isOwnDraft = (row: MyIdeaRow) => row.status === 'draft' && !!user && row.created_by === user.id;
  const canContinue = (row: MyIdeaRow) => submissionOpen && isOwnDraft(row);
  // Drafts the deadline caught; "not open yet" never shows this note.
  const missedDeadline = (row: MyIdeaRow) => !!program && windowState === 'closed' && row.status === 'draft';

  const columns: ResponsiveTableColumn<MyIdeaRow>[] = [
    {
      key: 'idea_title',
      header: 'Idea',
      mobile: 'title',
      cell: (row) => {
        const title = row.idea_title || <span className="text-muted-foreground">Untitled draft</span>;
        if (missedDeadline(row)) {
          return (
            <span className="flex flex-col items-start gap-1">
              <span>{title}</span>
              <span className="text-sm font-normal text-muted-foreground">Not submitted before the deadline</span>
            </span>
          );
        }
        if (!canContinue(row)) return title;
        return (
          <span className="flex flex-col items-start gap-2">
            <span>{title}</span>
            <Button asChild size="sm" variant="outline">
              <Link href={`/submit?draft=${row.id}`} aria-label={`Continue editing ${row.idea_title || 'untitled draft'}`}>
                <Pencil className="h-4 w-4" aria-hidden="true" /> Continue editing
              </Link>
            </Button>
          </span>
        );
      },
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
          submissionOpen ? (
            <Button asChild>
              <Link href="/submit">
                <PlusCircle className="h-4 w-4" /> Submit New Idea
              </Link>
            </Button>
          ) : undefined
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
            title={windowState === 'closed' && program ? 'Submissions are closed' : 'You have no ideas yet'}
            description="Ideas you create, lead or are added to as a team member appear here."
            action={
              submissionOpen ? (
                <Button asChild>
                  <Link href="/submit">Submit a new idea</Link>
                </Button>
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}
