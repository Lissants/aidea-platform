import Link from 'next/link';
import { FileX } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Button } from '@/components/ui/button';
import { NoActiveProgram } from '@/components/layout/no-active-program';
import { IdeaWizard } from '@/components/forms/idea-wizard';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { profileReadFilter } from '@/lib/permissions/scopes';
import { fetchEditableDraft } from '@/lib/ideas/idea-draft';
import { stageDateMask } from '@/lib/program/timeline';
import type { Program } from '@/types/database';

export const metadata = { title: 'Submit New Idea' };

export default async function SubmitIdeaPage(props: { searchParams: Promise<{ draft?: string }> }) {
  const { draft: draftId } = await props.searchParams;
  const program = await db.queryOne<Program>(
    `SELECT TOP (1) * FROM programs WHERE status = 'active' ORDER BY created_at DESC`
  );

  if (!program) {
    return (
      <div>
        <PageHeader title="Submit New Idea" />
        <NoActiveProgram audience="participant" />
      </div>
    );
  }

  // mentor_profiles are readable by any signed-in user; the joined profile
  // name follows the same profile visibility rule as everywhere else.
  const user = await getCurrentUser();

  // ?draft=<id> reopens a saved draft (only the creator's, still in draft).
  const draft = draftId && user ? await fetchEditableDraft(draftId, user.id) : null;
  if (draftId && (!draft || draft.programId !== program.id)) {
    return (
      <div>
        <PageHeader title="Continue Draft" />
        <EmptyState
          icon={FileX}
          title="This draft can't be edited"
          description="It may already have been submitted, or it belongs to someone else. Only the person who created a draft can continue it."
          action={
            <Button asChild variant="outline">
              <Link href="/my-ideas">Back to My Ideas</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const profileScope = user ? profileReadFilter(user, 'p') : { sql: '1 = 0', params: {} };
  const mentorRows = await db.query<{ id: string; expertise: string | null; full_name: string | null; job_title: string | null }>(
    `SELECT mp.id, mp.expertise, p.full_name, p.job_title
       FROM mentor_profiles mp
       LEFT JOIN profiles p ON p.id = mp.profile_id AND ${profileScope.sql}`,
    profileScope.params
  );

  const mentors = mentorRows.map((m) => ({
    mentor_profile_id: m.id,
    full_name: m.full_name ?? 'Mentor',
    job_title: m.job_title,
    expertise: m.expertise,
  }));

  // An admin can hide the real close date behind a TBA message.
  const closeMask = stageDateMask(program, 'submission_close_at');

  return (
    <div>
      <PageHeader
        title={draft ? 'Continue Draft' : 'Submit New Idea'}
        description={
          closeMask
            ? `${program.title}. Submissions close: ${closeMask}.`
            : program.submission_close_at
              ? `${program.title}. Submissions close ${new Date(program.submission_close_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.`
              : program.title
        }
      />
      <IdeaWizard programId={program.id} mentors={mentors} initial={draft ?? undefined} />
    </div>
  );
}
