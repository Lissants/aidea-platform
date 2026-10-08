import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { MetricRow } from '@/components/layout/metric';
import { NextStepHeader } from '@/components/overview/next-step-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import { humanizeAuditAction } from '@/lib/audit/labels';
import type { StatusKey } from '@/lib/constants/status';

interface OverviewCounts {
  totalIdeas: number;
  submittedIdeas: number;
  routingRequired: number;
  mentors: number;
  pendingReviews: number;
  completedReviews: number;
  // "Ready to finalize/decide" approximated as submitted ideas minus
  // ideas that already have any screening decision recorded — kept as a
  // simple pair of counts rather than a fragile nested filter.
  screeningDecisionsRecorded: number;
  screeningReadyToPublish: number;
  qualifierReadyToPublish: number;
  mentorAssignReadyToPublish: number;
  finalReadyToPublish: number;
}

interface Decision {
  text: string;
  href: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function AdminOverview() {
  // Platform-wide aggregates and the audit feed are admin-only data.
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return null;

  const [program, counts, recentAuditRows, latestVotingPeriod] = await Promise.all([
    db.queryOne<{ title: string; submission_close_at: string | null }>('SELECT TOP (1) * FROM programs ORDER BY created_at DESC'),
    db.queryOne<OverviewCounts>(
      `SELECT
         (SELECT COUNT(*) FROM ideas) AS totalIdeas,
         (SELECT COUNT(*) FROM ideas WHERE status = 'submitted') AS submittedIdeas,
         (SELECT COUNT(*) FROM review_assignments WHERE status = 'routing_required') AS routingRequired,
         (SELECT COUNT(*) FROM mentor_profiles) AS mentors,
         (SELECT COUNT(*) FROM reviews WHERE status IN ('draft', 'reopened')) AS pendingReviews,
         (SELECT COUNT(*) FROM reviews WHERE status = 'submitted') AS completedReviews,
         (SELECT COUNT(*) FROM screening_decisions) AS screeningDecisionsRecorded,
         (SELECT COUNT(*) FROM screening_decisions WHERE decided_at IS NOT NULL AND published = 0) AS screeningReadyToPublish,
         (SELECT COUNT(*) FROM qualifier_assessments WHERE status = 'finalized' AND published = 0) AS qualifierReadyToPublish,
         (SELECT COUNT(*) FROM project_mentor_assignments WHERE published = 0) AS mentorAssignReadyToPublish,
         (SELECT COUNT(*) FROM final_presentation_assessments WHERE status = 'finalized' AND published = 0) AS finalReadyToPublish`
    ),
    db.query<{ action: string; entity_type: string; created_at: string; actor_name: string | null }>(
      `SELECT TOP (6) a.action, a.entity_type, a.created_at, p.full_name AS actor_name
         FROM audit_logs a
         LEFT JOIN profiles p ON p.id = a.actor_id
        ORDER BY a.created_at DESC`
    ),
    db.queryOne<{ opens_at: string; closes_at: string; results_published: boolean }>(
      'SELECT TOP (1) * FROM voting_periods ORDER BY opens_at DESC'
    ),
  ]);

  const c: Partial<OverviewCounts> = counts ?? {};
  const awaitingScreening = Math.max(0, (c.submittedIdeas ?? 0) - (c.screeningDecisionsRecorded ?? 0));

  const now = new Date();
  const voting: { key: StatusKey; text: string } = !latestVotingPeriod
    ? { key: 'not_applicable', text: 'No voting period configured' }
    : latestVotingPeriod.results_published
      ? { key: 'published', text: 'Results published' }
      : new Date(latestVotingPeriod.closes_at) < now
        ? { key: 'awaiting_publication', text: 'Voting closed. Results are not published yet.' }
        : new Date(latestVotingPeriod.opens_at) > now
          ? { key: 'voting_scheduled', text: `Opens ${formatDate(latestVotingPeriod.opens_at)}` }
          : { key: 'voting_open', text: `Closes ${formatDate(latestVotingPeriod.closes_at)}` };

  // Each item names the decision and links to the page that resolves it,
  // in pipeline order.
  const decisions: Decision[] = [];
  if (!program) decisions.push({ text: 'No program is set up yet', href: '/program' });
  if (program && !program.submission_close_at)
    decisions.push({ text: 'The program has no submission close date', href: '/program' });
  if (c.routingRequired)
    decisions.push({ text: `${plural(c.routingRequired, 'idea needs', 'ideas need')} a reviewer assigned by hand`, href: '/review-assignment' });
  if (awaitingScreening)
    decisions.push({ text: `${plural(awaitingScreening, 'submitted idea has', 'submitted ideas have')} no screening decision yet`, href: '/screening' });
  if (c.screeningReadyToPublish)
    decisions.push({ text: `${plural(c.screeningReadyToPublish, 'screening decision is', 'screening decisions are')} final but not published`, href: '/screening' });
  if (c.qualifierReadyToPublish)
    decisions.push({ text: `${plural(c.qualifierReadyToPublish, 'qualifier result is', 'qualifier results are')} final but not published`, href: '/qualifier' });
  if (c.mentorAssignReadyToPublish)
    decisions.push({ text: `${plural(c.mentorAssignReadyToPublish, 'project mentor assignment is', 'project mentor assignments are')} not published`, href: '/project-mentor' });
  if (c.finalReadyToPublish)
    decisions.push({ text: `${plural(c.finalReadyToPublish, 'final presentation result is', 'final presentation results are')} not published`, href: '/final-presentation' });
  if (!latestVotingPeriod) decisions.push({ text: 'No voting period has been scheduled', href: '/voting-management' });

  return (
    <div className="max-w-5xl space-y-10">
      <NextStepHeader
        eyebrow={program?.title ?? 'Program overview'}
        step={
          decisions.length > 0
            ? {
                title: `${plural(decisions.length, 'item needs', 'items need')} your decision`,
                body: 'Each item below opens the page where you can resolve it.',
              }
            : { title: 'Nothing needs a decision right now', body: 'New submissions, reviews and results will appear here as they arrive.' }
        }
      />

      {decisions.length > 0 && (
        <section aria-labelledby="decisions-title" className="space-y-3">
          <h2 id="decisions-title" className="text-lg font-bold">
            Needs a decision
          </h2>
          <ul className="divide-y rounded-xl border border-warning/40">
            {decisions.map((d) => (
              <li key={d.text}>
                <Link
                  href={d.href}
                  className="flex min-h-12 items-center gap-3 px-4 py-3 transition-colors hover:bg-warning-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  <span className="flex-1 font-semibold">{d.text}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="pipeline-title" className="space-y-3">
        <h2 id="pipeline-title" className="text-lg font-bold">
          Pipeline
        </h2>
        <MetricRow
          label="Pipeline counts in workflow order"
          items={[
            { label: 'Ideas', value: c.totalIdeas ?? 0, hint: 'including drafts', href: '/ideas' },
            { label: 'Submitted', value: c.submittedIdeas ?? 0, href: '/ideas?stage=submitted' },
            { label: 'Routing required', value: c.routingRequired ?? 0, href: '/review-assignment' },
            { label: 'Reviews in progress', value: c.pendingReviews ?? 0, href: '/review-assignment' },
            { label: 'Reviews completed', value: c.completedReviews ?? 0, href: '/screening' },
            { label: 'Mentors', value: c.mentors ?? 0, href: '/mentors' },
          ]}
        />
      </section>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section aria-labelledby="voting-title" className="space-y-3">
          <h2 id="voting-title" className="text-lg font-bold">
            Voting
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {voting.key !== 'not_applicable' && <StatusBadge status={voting.key} />}
            <span className="text-sm text-muted-foreground">{voting.text}</span>
          </div>
          <Link href="/voting-management" className="focus-ring inline-block text-sm font-semibold underline underline-offset-4">
            Manage voting
          </Link>
        </section>

        <section aria-labelledby="activity-title" className="space-y-3">
          <h2 id="activity-title" className="text-lg font-bold">
            Recent sensitive activity
          </h2>
          {recentAuditRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit activity yet.</p>
          ) : (
            <ul className="divide-y rounded-xl border text-sm">
              {recentAuditRows.map((a, idx) => (
                <li key={idx} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <span className="min-w-0">
                    <span className="font-semibold">{humanizeAuditAction(a.action, a.entity_type)}</span>
                    <span className="text-muted-foreground"> by {a.actor_name ?? 'System'}</span>
                  </span>
                  <time dateTime={a.created_at} className="shrink-0 tabular-nums text-muted-foreground">
                    {formatDate(a.created_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
          <Link href="/audit" className="focus-ring inline-block text-sm font-semibold underline underline-offset-4">
            View full audit log
          </Link>
        </section>
      </div>
    </div>
  );
}
