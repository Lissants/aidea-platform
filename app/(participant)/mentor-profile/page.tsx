import { Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { MentorProfileCard } from '@/components/mentors/mentor-profile-card';
import { fetchPublicMentorProfiles } from '@/lib/services/mentors';

export const metadata = { title: 'Mentor Profile' };

export default async function MentorProfilePage() {
  const mentors = await fetchPublicMentorProfiles();

  return (
    <div>
      <PageHeader title="Mentor Profile" description="Get to know the mentors guiding ideas through the program." />
      {mentors.length === 0 ? (
        <EmptyState icon={Users} title="No mentors yet" description="Mentor profiles appear here once mentors are added." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {mentors.map((m) => (
            <MentorProfileCard key={m.id} mentor={m} />
          ))}
        </div>
      )}
    </div>
  );
}
