import Link from 'next/link';
import { ClipboardCheck, LayoutDashboard } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SessionUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export async function MentorOverview({ user }: { user: SessionUser }) {
  const supabase = createClient();

  const { data: mentorProfile } = await supabase
    .from('mentor_profiles')
    .select('*')
    .eq('profile_id', user.id)
    .maybeSingle();

  const { count: pendingReviews } = mentorProfile
    ? await supabase
        .from('review_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('mentor_profile_id', mentorProfile.id)
        .eq('status', 'pending')
    : { count: 0 };

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
