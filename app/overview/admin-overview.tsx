import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ClipboardList, Gavel, History, Lightbulb, Rocket, Users, Vote } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  href?: string;
}) {
  const inner = (
    <Card className={href ? 'transition-colors hover:bg-muted/50' : undefined}>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Icon className="h-4 w-4" /> {label}
        </CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export async function AdminOverview() {
  const supabase = createClient();

  const { data: program } = await supabase
    .from('programs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const [
    { count: totalIdeas },
    { count: submittedIdeas },
    { count: routingRequired },
    { count: mentors },
    { count: pendingReviews },
    { count: completedReviews },
    { count: screeningDecisionsRecorded },
    { count: screeningReadyToPublish },
    { count: qualifierReadyToPublish },
    { count: mentorAssignReadyToPublish },
    { count: finalReadyToPublish },
    { data: recentAudit },
    { data: latestVotingPeriod },
  ] = await Promise.all([
    supabase.from('ideas').select('*', { count: 'exact', head: true }),
    supabase.from('ideas').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
    supabase.from('review_assignments').select('*', { count: 'exact', head: true }).eq('status', 'routing_required'),
    supabase.from('mentor_profiles').select('*', { count: 'exact', head: true }),
    supabase.from('reviews').select('*', { count: 'exact', head: true }).in('status', ['draft', 'reopened']),
    supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
    // "Ready to finalize/decide" approximated as submitted ideas minus
    // ideas that already have any screening decision recorded — kept as a
    // simple pair of counts rather than a fragile nested-embed filter.
    supabase.from('screening_decisions').select('*', { count: 'exact', head: true }),
    supabase.from('screening_decisions').select('*', { count: 'exact', head: true }).not('decided_at', 'is', null).eq('published', false),
    supabase.from('qualifier_assessments').select('*', { count: 'exact', head: true }).eq('status', 'finalized').eq('published', false),
    supabase.from('project_mentor_assignments').select('*', { count: 'exact', head: true }).eq('published', false),
    supabase.from('final_presentation_assessments').select('*', { count: 'exact', head: true }).eq('status', 'finalized').eq('published', false),
    supabase.from('audit_logs').select('action, entity_type, created_at, profiles:actor_id(full_name)').order('created_at', { ascending: false }).limit(6),
    supabase.from('voting_periods').select('*').order('opens_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const readyToFinalize = Math.max(0, (submittedIdeas ?? 0) - (screeningDecisionsRecorded ?? 0));
  const readyToPublishTotal =
    (screeningReadyToPublish ?? 0) + (qualifierReadyToPublish ?? 0) + (mentorAssignReadyToPublish ?? 0) + (finalReadyToPublish ?? 0);

  const now = new Date();
  const votingStatus = !latestVotingPeriod
    ? 'No voting period configured'
    : latestVotingPeriod.results_published
      ? 'Results published'
      : new Date(latestVotingPeriod.closes_at) < now
        ? 'Closed — awaiting publication'
        : new Date(latestVotingPeriod.opens_at) > now
          ? 'Scheduled'
          : 'Open';

  const warnings: string[] = [];
  if (!program) warnings.push('No program has been configured yet — set one up in Program Configuration.');
  if ((routingRequired ?? 0) > 0) warnings.push(`${routingRequired} idea(s) need manual reviewer assignment.`);
  if (readyToPublishTotal > 0) warnings.push(`${readyToPublishTotal} decision(s) are finalized but not yet published.`);
  if (!latestVotingPeriod) warnings.push('No voting period has been scheduled.');
  if (program && !program.submission_close_at) warnings.push('Program has no submission close date set.');

  return (
    <div>
      <PageHeader title="Program overview" description="Snapshot of the current AI Innovation Challenge cycle." />

      {warnings.length > 0 && (
        <Card className="mb-6 border-warning/50 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-warning-foreground">
              <AlertTriangle className="h-4 w-4" /> Needs attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Lightbulb} label="Total ideas" value={totalIdeas ?? 0} href="/ideas" />
        <StatCard icon={Lightbulb} label="Submitted" value={submittedIdeas ?? 0} href="/ideas" />
        <StatCard icon={Gavel} label="Routing required" value={routingRequired ?? 0} href="/review-assignment" />
        <StatCard icon={Users} label="Mentors" value={mentors ?? 0} href="/mentors" />
        <StatCard icon={ClipboardList} label="Pending reviews" value={pendingReviews ?? 0} href="/review-assignment" />
        <StatCard icon={CheckCircle2} label="Completed reviews" value={completedReviews ?? 0} href="/ideas" />
        <StatCard icon={Rocket} label="Ready to finalize/decide" value={readyToFinalize} href="/screening" />
        <StatCard icon={Rocket} label="Ready to publish" value={readyToPublishTotal} href="/screening" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Vote className="h-4 w-4" /> Voting status
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>{votingStatus}</p>
            <Link href="/voting-management" className="mt-2 inline-block text-primary hover:underline">
              Manage voting →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" /> Recent sensitive activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(recentAudit ?? []).length === 0 ? (
              <p className="text-muted-foreground">No audit activity yet.</p>
            ) : (
              (recentAudit as any[]).map((a, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {a.action} on {a.entity_type} by {a.profiles?.full_name ?? 'System'}
                  </span>
                  <span>{formatDate(a.created_at)}</span>
                </div>
              ))
            )}
            <Link href="/audit" className="inline-block text-primary hover:underline">
              View full audit log →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/review-assignment" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          Review Assignment
        </Link>
        <Link href="/screening" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          Screening
        </Link>
        <Link href="/qualifier" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          Qualifier
        </Link>
        <Link href="/project-mentor" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          Project Mentor
        </Link>
        <Link href="/final-presentation" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          Final Presentation
        </Link>
        <Link href="/showcase-content" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
          Showcase Content
        </Link>
      </div>
    </div>
  );
}
