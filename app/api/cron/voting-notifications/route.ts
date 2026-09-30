import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Cron-triggered route: fires the "voting opened" notification once a
 * period's opens_at has passed, and a "voting closing soon" reminder once a
 * still-open period is within 24h of closes_at — each exactly once, guarded
 * by the opened_notified_at / closing_reminder_sent_at idempotency columns
 * on voting_periods (db/migrations/0001_schema.sql).
 *
 * Not wired to an actual scheduler in this repo — deploy this behind your
 * platform's cron (Vercel Cron / a company scheduler) hitting this route
 * on, say, an hourly cadence with header `Authorization: Bearer
 * ${CRON_SECRET}`. Queries the database directly — no end-user session
 * exists when a scheduler calls this, so the CRON_SECRET check below is the
 * only gate. Each period is claimed (idempotency column set) and its
 * notifications inserted in one transaction, so overlapping runs can't
 * double-notify.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();
  const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  let openedCount = 0;
  let reminderCount = 0;

  const toOpen = await db.query<{ id: string }>(
    'SELECT id FROM voting_periods WHERE opens_at <= @now AND opened_notified_at IS NULL',
    { now }
  );

  for (const period of toOpen) {
    const claimed = await db.transaction(async (tx) => {
      const n = await tx.execute(
        'UPDATE voting_periods SET opened_notified_at = @now WHERE id = @id AND opened_notified_at IS NULL',
        { id: period.id, now }
      );
      if (n === 0) return false;
      // Every profile is eligible to vote.
      await tx.execute(
        `INSERT INTO notifications (user_id, type, title, body, link)
         SELECT id, 'voting_opened', 'Voting is open', 'You can now cast your Favorite Project vote.', '/voting'
           FROM profiles`
      );
      return true;
    });
    if (claimed) openedCount += 1;
  }

  const toRemind = await db.query<{ id: string }>(
    `SELECT id FROM voting_periods
      WHERE closes_at <= @in24h AND closes_at > @now AND closing_reminder_sent_at IS NULL`,
    { now, in24h }
  );

  for (const period of toRemind) {
    const claimed = await db.transaction(async (tx) => {
      const n = await tx.execute(
        'UPDATE voting_periods SET closing_reminder_sent_at = @now WHERE id = @id AND closing_reminder_sent_at IS NULL',
        { id: period.id, now }
      );
      if (n === 0) return false;
      await tx.execute(
        `INSERT INTO notifications (user_id, type, title, body, link)
         SELECT id, 'voting_closing_reminder', 'Voting closes soon', @body, '/voting'
           FROM profiles`,
        { body: "Favorite Project voting closes within 24 hours — cast your vote if you haven't yet." }
      );
      return true;
    });
    if (claimed) reminderCount += 1;
  }

  return NextResponse.json({ ok: true, opened: openedCount, remindersSent: reminderCount });
}
