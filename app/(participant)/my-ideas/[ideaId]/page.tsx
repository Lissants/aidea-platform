import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { IdeaDetailReadonly } from '@/components/ideas/idea-detail-readonly';
import { qualifierBadgeStatus, screeningBadgeStatus } from '@/components/ideas/result-columns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { AttentionFlag } from '@/components/ui/attention-flag';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/auth/session';
import { fetchMyIdeaDetail, MY_ROLE_LABEL } from '@/lib/ideas/my-ideas';
import { db } from '@/lib/db';
import { submissionWindowState } from '@/lib/program/submission-window';
import type { Program } from '@/types/database';

export const metadata = { title: 'Idea Detail' };

/**
 * Participant read-only view of one idea they created, lead or are a member
 * of. Anyone else gets a 404. Results are published-only (same rule as the
 * My Ideas table).
 */
export default async function MyIdeaDetailPage({ params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const [idea, program] = await Promise.all([
    fetchMyIdeaDetail(ideaId, user.id),
    db.queryOne<Program>(`SELECT TOP (1) * FROM programs WHERE status = 'active' ORDER BY created_at DESC`),
  ]);
  if (!idea) notFound();

  const submitted = idea.status === 'submitted';
  // Same rule as My Ideas: only the creator, and only while the window is open.
  const canContinue =
    !submitted && idea.created_by === user.id && !!program && submissionWindowState(program) === 'open';

  return (
    <div>
      <PageHeader
        title={idea.idea_title || 'Untitled draft'}
        description={idea.team_name || undefined}
        breadcrumbs={
          <Link
            href="/my-ideas"
            className="focus-ring inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to My Ideas
          </Link>
        }
        action={
          canContinue ? (
            <Button asChild>
              <Link href={`/submit?draft=${idea.id}`}>
                <Pencil className="h-4 w-4" aria-hidden="true" /> Continue editing
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={submitted ? 'submitted' : 'draft'} />
        {submitted && !idea.team_leader && <AttentionFlag>Leader vacant</AttentionFlag>}
        <span className="text-muted-foreground">Your role: {MY_ROLE_LABEL[idea.my_role]}</span>
      </div>

      {submitted && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Results</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="space-y-1">
                <dt className="font-medium">Screening</dt>
                <dd>
                  <StatusBadge status={screeningBadgeStatus(idea.screening)} />
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="font-medium">Qualifier</dt>
                <dd>
                  <StatusBadge status={qualifierBadgeStatus(idea.qualifier)} />
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="font-medium">Project Mentor</dt>
                <dd className={idea.mentor_name ? undefined : 'text-muted-foreground'}>{idea.mentor_name ?? 'N/A'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      <IdeaDetailReadonly idea={idea} />
    </div>
  );
}
