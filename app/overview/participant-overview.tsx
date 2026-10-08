import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { CommitIdeaPanel } from '@/components/ideas/commit-idea-panel';
import { NextStepHeader } from '@/components/overview/next-step-header';
import { ProgramTimeline } from '@/components/overview/program-timeline';
import { db } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { fetchMyMembershipConflicts } from '@/lib/services/team-membership';
import { fetchMyIdeas } from '@/lib/ideas/my-ideas';
import { participantIdeaStatusKey, participantNextStep } from '@/lib/overview/next-step';
import type { Program } from '@/types/database';

const RECENT_IDEAS = 5;

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
}

export async function ParticipantOverview({ user }: { user: SessionUser }) {
  // Independent reads, fetched in parallel.
  const [program, ideas, conflicts, votingPeriod] = await Promise.all([
    db.queryOne<Program>(`SELECT TOP (1) * FROM programs WHERE status = 'active' ORDER BY created_at DESC`),
    fetchMyIdeas(user.id),
    fetchMyMembershipConflicts(),
    db.queryOne<{ opens_at: string; closes_at: string }>('SELECT TOP (1) opens_at, closes_at FROM voting_periods ORDER BY opens_at DESC'),
  ]);

  const now = new Date();
  const submissionOpen =
    !!program &&
    (!program.submission_open_at || new Date(program.submission_open_at) <= now) &&
    (!program.submission_close_at || new Date(program.submission_close_at) > now);
  const votingOpen = !!votingPeriod && new Date(votingPeriod.opens_at) <= now && new Date(votingPeriod.closes_at) > now;

  const next = participantNextStep({
    conflictCount: conflicts.length,
    ideas: ideas.map((i) => ({ status: i.status, screening: i.screening, qualifier: i.qualifier })),
    submissionOpen,
    submissionCloseLabel: program?.submission_close_at ? longDate(program.submission_close_at) : null,
    votingOpen,
    votingCloseLabel: votingPeriod ? longDate(votingPeriod.closes_at) : null,
  });

  const firstName = user.profile?.full_name?.split(' ')[0];

  return (
    <div className="max-w-5xl space-y-10">
      <NextStepHeader
        eyebrow={`${firstName ? `Welcome back, ${firstName}. ` : ''}${program?.title ?? 'AI Innovation Challenge'}`}
        step={next}
      />

      <CommitIdeaPanel conflicts={conflicts} />

      {program && (
        <section aria-labelledby="timeline-title" className="space-y-3">
          <h2 id="timeline-title" className="text-lg font-bold">
            Program timeline
          </h2>
          <ProgramTimeline program={program} now={now} />
        </section>
      )}

      <section aria-labelledby="my-ideas-title" className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="my-ideas-title" className="text-lg font-bold">
            Your ideas <span className="font-normal tabular-nums text-muted-foreground">({ideas.length})</span>
          </h2>
          {ideas.length > 0 && (
            <Link href="/my-ideas" className="focus-ring text-sm font-semibold underline underline-offset-4">
              View all in My Ideas
            </Link>
          )}
        </div>
        {ideas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ideas you create, lead or are added to as a team member will appear here.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {ideas.slice(0, RECENT_IDEAS).map((idea) => (
              <li key={idea.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-semibold">
                    {idea.idea_title || <span className="font-normal text-muted-foreground">Untitled draft</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">{idea.team_name || 'No team name yet'}</p>
                </div>
                <StatusBadge status={participantIdeaStatusKey(idea)} />
              </li>
            ))}
          </ul>
        )}
        {ideas.length === 0 && submissionOpen && (
          <Button asChild variant="outline">
            <Link href="/submit">Submit New Idea</Link>
          </Button>
        )}
      </section>
    </div>
  );
}
