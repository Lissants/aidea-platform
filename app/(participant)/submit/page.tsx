import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { AlertTriangle } from 'lucide-react';
import { IdeaWizard } from '@/components/forms/idea-wizard';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { profileReadFilter } from '@/lib/permissions/scopes';
import type { Program } from '@/types/database';

export const metadata = { title: 'Submit New Idea' };

export default async function SubmitIdeaPage() {
  const program = await db.queryOne<Program>(
    `SELECT TOP (1) * FROM programs WHERE status = 'active' ORDER BY created_at DESC`
  );

  if (!program) {
    return (
      <div>
        <PageHeader title="Submit New Idea" />
        <EmptyState icon={AlertTriangle} title="No active program" description="There is no open submission window right now." />
      </div>
    );
  }

  // mentor_profiles are readable by any signed-in user; the joined profile
  // name follows the same profile visibility rule as everywhere else.
  const user = await getCurrentUser();
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

  return (
    <div>
      <PageHeader title="Submit New Idea" description={program.title} />
      <IdeaWizard programId={program.id} mentors={mentors} />
    </div>
  );
}
