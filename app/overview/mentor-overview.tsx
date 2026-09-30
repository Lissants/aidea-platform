import Link from 'next/link';
import { ClipboardCheck, LayoutDashboard } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SessionUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import type { MentorProfile } from '@/types/database';

export async function MentorOverview({ user }: { user: SessionUser }) {
  const mentorProfile = await db.queryOne<MentorProfile>('SELECT * FROM mentor_profiles WHERE profile_id = @uid', {
    uid: user.id,
  });

  const pendingReviews = mentorProfile
    ? ((
        await db.queryOne<{ count: number }>(
          `SELECT COUNT(*) AS count FROM review_assignments WHERE mentor_profile_id = @mentorProfileId AND status = 'pending'`,
          { mentorProfileId: mentorProfile.id }
        )
      )?.count ?? 0)
    : 0;

  return (
    <div>
      <PageHeader
        title={`Welcome${user.profile?.full_name ? `, ${user.profile.full_name.split(' ')[0]}` : ''}`}
        description="Mentor dashboard"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> Pending reviews
            </CardDescription>
            <CardTitle className="text-3xl">{pendingReviews ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" /> Idea Dashboard
            </CardDescription>
            <CardTitle className="text-lg">
              <Link href="/dashboard" className="text-primary hover:underline">
                Open dashboard
              </Link>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Mentoring capacity</CardDescription>
            <CardTitle className="text-lg">{mentorProfile ? `Up to ${mentorProfile.max_capacity} ideas` : '—'}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
