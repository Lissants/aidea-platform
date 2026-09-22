import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, History } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { IdeaDetailReadonly } from '@/components/ideas/idea-detail-readonly';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ReopenReviewAction } from '@/components/admin/reopen-review-action';
import { fetchIdeaDetail } from '@/lib/services/idea-management';

export const metadata = { title: 'Idea Detail' };

export default async function IdeaDetailPage({ params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  const idea = await fetchIdeaDetail(ideaId);
  if (!idea) notFound();

  return (
    <div>
      <PageHeader
        title={idea.idea_title}
        description={idea.team_name}
        breadcrumbs={
          <Link href="/ideas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Idea Management
          </Link>
        }
        action={
          <Link
            href={`/audit?entity_id=${idea.id}`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <History className="h-4 w-4" /> Audit history
          </Link>
        }
      />

      <div className="mb-4">
        <StatusBadge status={idea.status === 'submitted' ? 'submitted' : 'draft'} />
      </div>

      {idea.review && (
        <Card className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Review status</CardTitle>
            {idea.review.status === 'submitted' && <ReopenReviewAction reviewId={idea.review.id} ideaId={idea.id} />}
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {idea.review.reviewer_name ?? 'Unassigned reviewer'} — status: {idea.review.status}
          </CardContent>
        </Card>
      )}

      <IdeaDetailReadonly idea={idea} />
    </div>
  );
}
