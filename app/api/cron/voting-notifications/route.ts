import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Cron-triggered route: fires the "voting opened" notification once a
 * period's opens_at has passed, and a "voting closing soon" reminder once a
 * still-open period is within 24h of closes_at — each exactly once, guarded
 * by the opened_notified_at / closing_reminder_sent_at idempotency columns
 * added in 0015_voting_lifecycle_and_reviewer_notify.sql.
 *
 * Not wired to an actual scheduler in this repo — deploy this behind your
 * platform's cron (Vercel Cron / a company scheduler) hitting this route
 * on, say, an hourly cadence with header `Authorization: Bearer
 * ${CRON_SECRET}`. Uses the service-role admin client (bypasses RLS)
 * because no end-user session exists when a scheduler calls this.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  let openedCount = 0;
  let reminderCount = 0;

  const { data: toOpen } = await supabase
    .from('voting_periods')
    .select('id')
    .lte('opens_at', now)
    .is('opened_notified_at', null);

  for (const period of toOpen ?? []) {
    const { data: eligible } = await supabase.from('profiles').select('id');
    const ids = (eligible ?? []).map((p) => p.id);
    if (ids.length > 0) {
      await supabase.from('notifications').insert(
        ids.map((uid) => ({
          user_id: uid,
          type: 'voting_opened',
          title: 'Voting is open',
          body: 'You can now cast your Favorite Project vote.',
          link: '/voting',
        }))
      );
    }
    await supabase.from('voting_periods').update({ opened_notified_at: now }).eq('id', period.id);
    openedCount += 1;
  }

  const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: toRemind } = await supabase
    .from('voting_periods')
    .select('id')
    .lte('closes_at', in24h)
    .gt('closes_at', now)
    .is('closing_reminder_sent_at', null);

  for (const period of toRemind ?? []) {
    const { data: voters } = await supabase.from('profiles').select('id');
    const ids = (voters ?? []).map((p) => p.id);
    if (ids.length > 0) {
      await supabase.from('notifications').insert(
        ids.map((uid) => ({
          user_id: uid,
          type: 'voting_closing_reminder',
          title: 'Voting closes soon',
          body: 'Favorite Project voting closes within 24 hours — cast your vote if you haven\'t yet.',
          link: '/voting',
        }))
      );
    }
    await supabase.from('voting_periods').update({ closing_reminder_sent_at: now }).eq('id', period.id);
    reminderCount += 1;
  }

  return NextResponse.json({ ok: true, opened: openedCount, remindersSent: reminderCount });
}
