import { Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { MentorDirectoryRow } from '@/components/admin/mentor-directory-row';
import { fetchMentorDirectory } from '@/lib/services/mentors';
import { db } from '@/lib/db';

export const metadata = { title: 'Mentor Directory' };

export default async function MentorDirectoryPage() {
  const program = await db.queryOne<{ id: string }>(
    `SELECT TOP (1) id FROM programs WHERE status = 'active' ORDER BY created_at DESC`
  );

  if (!program) {
    return (
      <div>
        <PageHeader title="Mentor Directory" />
        <EmptyState icon={Users} title="No active program" description="There is no active program right now." />
      </div>
    );
  }

  const mentors = await fetchMentorDirectory(program.id);

  return (
    <div>
      <PageHeader title="Mentor Directory" description="Every mentor's capacity, expertise, and active review load." />
      {mentors.length === 0 ? (
        <EmptyState icon={Users} title="No mentors yet" description="Mentors appear here once their profiles are seeded or created." />
      ) : (
        <div className="space-y-3">
          {mentors.map((m) => (
            <MentorDirectoryRow key={m.mentor_profile_id} mentor={m} />
          ))}
        </div>
      )}
    </div>
  );
}
