import { redirect } from 'next/navigation';
import { getCurrentUser, getActiveRole } from '@/lib/auth/session';
import { AdminOverview } from './admin-overview';
import { MentorOverview } from './mentor-overview';
import { ParticipantOverview } from './participant-overview';

export const metadata = { title: 'Overview' };

/**
 * Single shared route for all three role-based overview experiences.
 * Route groups like (admin)/(mentor)/(participant) don't add URL segments,
 * so three separate `overview/page.tsx` files would all collide on
 * `/overview` — this page renders the right content itself based on the
 * viewer's active role instead.
 */
export default async function OverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const activeRole = getActiveRole(user);

  if (activeRole === 'admin') return <AdminOverview />;
  if (activeRole === 'mentor') return <MentorOverview user={user} />;
  if (activeRole === 'participant') return <ParticipantOverview user={user} />;

  // Employee voters have no dedicated overview — send them to their home page.
  redirect('/showcase');
}
