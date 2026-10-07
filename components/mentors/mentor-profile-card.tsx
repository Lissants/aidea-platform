import { Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { MentorAvatar } from '@/components/mentors/mentor-avatar';
import type { PublicMentorProfile } from '@/lib/services/mentors';

/** Read-only mentor card for the Mentor Profile page. */
export function MentorProfileCard({ mentor }: { mentor: PublicMentorProfile }) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-center gap-4">
          <MentorAvatar name={mentor.full_name} photoUrl={mentor.photo_url} size="lg" />
          <div className="min-w-0">
            <p className="font-semibold leading-tight">{mentor.full_name}</p>
            {mentor.job_title && <p className="mt-0.5 text-sm text-muted-foreground">{mentor.job_title}</p>}
            {mentor.department && <p className="text-sm text-muted-foreground">{mentor.department}</p>}
          </div>
        </div>
        {mentor.expertise ? (
          <p className="whitespace-pre-line text-sm leading-relaxed">{mentor.expertise}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">No expertise added yet.</p>
        )}
        {mentor.email && (
          <a
            href={`mailto:${mentor.email}`}
            className="mt-auto inline-flex items-center gap-1.5 text-sm [overflow-wrap:anywhere] text-primary underline-offset-4 hover:underline"
          >
            <Mail className="h-4 w-4 shrink-0" />
            {mentor.email}
          </a>
        )}
      </CardContent>
    </Card>
  );
}
