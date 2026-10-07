import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, History } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { IdeaDetailReadonly } from '@/components/ideas/idea-detail-readonly';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { reviewRowStatusKey } from '@/lib/constants/status';
import { ReopenReviewAction } from '@/components/admin/reopen-review-action';
import { TeamManagementCard } from '@/components/admin/team-management-card';
import { DeleteIdeaButton } from '@/components/admin/idea-list';
import { fetchIdeaDetail } from '@/lib/services/idea-management';
import { getCurrentUser } from '@/lib/auth/session';
import { isDeveloper } from '@/lib/permissions';

export const metadata = { title: 'Idea Detail' };

export default async function IdeaDetailPage({ params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  const [idea, user] = await Promise.all([fetchIdeaDetail(ideaId), getCurrentUser()]);
  if (!idea) notFound();
  const canDelete = !!user && isDeveloper(user.roles);

  return (
    <div>
      <PageHeader
        title={idea.idea_title}
        description={idea.team_name}
        breadcrumbs={
          <Link href="/ideas" className="focus-ring inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to Idea Management
          </Link>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href={`/audit?entity_id=${idea.id}`}>
                <History aria-hidden="true" /> Audit history
              </Link>
            </Button>
            {canDelete && <DeleteIdeaButton ideaId={idea.id} ideaTitle={idea.idea_title} redirectTo="/ideas" />}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={idea.status === 'submitted' ? 'submitted' : 'draft'} />
        {idea.approved && (
          <StatusBadge status="screened_pass" />
        )}
      </div>

      {idea.status === 'submitted' && (
        <TeamManagementCard ideaId={idea.id} leader={idea.team_leader} members={idea.team_members} />
      )}

      {idea.review && (
        <Card className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Review status</CardTitle>
            {idea.review.status === 'submitted' && <ReopenReviewAction reviewId={idea.review.id} ideaId={idea.id} />}
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>Reviewer: {idea.review.reviewer_name ?? 'not assigned'}</span>
              <StatusBadge status={reviewRowStatusKey(idea.review.status)} />
            </span>
          </CardContent>
        </Card>
      )}

      <IdeaDetailReadonly idea={idea} />
    </div>
  );
}
