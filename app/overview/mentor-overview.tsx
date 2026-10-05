import Link from 'next/link';
import { MetricRow } from '@/components/layout/metric';
import { NextStepHeader } from '@/components/overview/next-step-header';
import { StatusBadge } from '@/components/ui/status-badge';
import type { SessionUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { reviewStatusKey } from '@/lib/constants/status';
import { mentorNextStep } from '@/lib/overview/next-step';
import { mentorProfileIdFor } from '@/lib/permissions/scopes';
import { fetchMyReviewQueue, filterQueueByTab } from '@/lib/services/my-reviews';
import { formatDate } from '@/lib/utils';

export async function MentorOverview({ user }: { user: SessionUser }) {
  const mentorProfileId = await mentorProfileIdFor(user.id);
  // Same source as My Reviews, so the counts here always match its tabs.
  const [queue, profile] = mentorProfileId
    ? await Promise.all([
        fetchMyReviewQueue(mentorProfileId),
        db.queryOne<{ max_capacity: number }>('SELECT max_capacity FROM mentor_profiles WHERE id = @id', {
          id: mentorProfileId,
        }),
      ])
    : [[], null];

  const notStarted = filterQueueByTab(queue, 'pending');
  const inProgress = filterQueueByTab(queue, 'draft');
  const reopened = filterQueueByTab(queue, 'reopened');
  const completed = filterQueueByTab(queue, 'submitted');
  // Reopened first: an admin is waiting on those.
  const toDo = [...reopened, ...inProgress, ...notStarted];

  const next = mentorNextStep({ hasMentorProfile: !!mentorProfileId, totalAssigned: queue.length, toDo });
  const firstName = user.profile?.full_name?.split(' ')[0];

  return (
    <div className="max-w-5xl space-y-10">
      <NextStepHeader eyebrow={firstName ? `Welcome back, ${firstName}` : 'Mentor overview'} step={next} />

      {mentorProfileId && (
        <section aria-labelledby="review-counts-title" className="space-y-3">
          <h2 id="review-counts-title" className="text-lg font-bold">
            Your reviews
          </h2>
          <MetricRow
            label="Reviews by status"
            items={[
              { label: 'Not started', value: notStarted.length, href: '/reviews?tab=pending' },
              { label: 'In progress', value: inProgress.length, href: '/reviews?tab=draft' },
              { label: 'Reopened', value: reopened.length, href: '/reviews?tab=reopened' },
              { label: 'Completed', value: completed.length, href: '/reviews?tab=submitted' },
            ]}
          />
          {profile && (
            <p className="text-sm text-muted-foreground">
              Your capacity is up to {profile.max_capacity} ideas in this program.
            </p>
          )}
        </section>
      )}

      {toDo.length > 0 && (
        <section aria-labelledby="todo-title" className="space-y-3">
          <h2 id="todo-title" className="text-lg font-bold">
            To finish
          </h2>
          <ul className="divide-y rounded-xl border">
            {toDo.map((r) => (
              <li key={r.assignment_id}>
                <Link
                  href={`/reviews/${r.assignment_id}`}
                  className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0">
                    <span className="block break-words font-semibold">{r.idea_title}</span>
                    <span className="block text-sm text-muted-foreground">
                      {r.team_name}
                      {r.submitted_at ? `, submitted ${formatDate(r.submitted_at)}` : ''}
                    </span>
                  </span>
                  <StatusBadge status={reviewStatusKey(r.review_status)} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm">
        <Link href="/dashboard" className="focus-ring font-semibold underline underline-offset-4">
          Browse every idea in the Idea Dashboard
        </Link>
      </p>
    </div>
  );
}
