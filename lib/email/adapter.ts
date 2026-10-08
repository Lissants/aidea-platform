import 'server-only';
import { db } from '@/lib/db';

export interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
}

export interface EmailAdapter {
  send(email: OutgoingEmail): Promise<void>;
}

/**
 * Dev adapter: queues into email_outbox (status='pending') and logs to the
 * console instead of actually sending. A separate worker/cron (not built in
 * this phase) would flip pending -> sent/failed by actually dispatching
 * queued rows through the real provider.
 *
 * This module is server-only (not a Server Action), so only trusted server
 * code can queue mail; email_outbox is never read back to non-admins.
 *
 * TODO(production): implement a second adapter here backed by Microsoft
 * Graph `sendMail` (using MICROSOFT_TENANT_ID/CLIENT_ID/CLIENT_SECRET from
 * .env.example) or SMTP (EMAIL_PROVIDER/EMAIL_FROM), and select between
 * them with `EMAIL_PROVIDER`. Keep the same `EmailAdapter` interface so
 * call sites never change.
 */
class DevOutboxEmailAdapter implements EmailAdapter {
  async send(email: OutgoingEmail): Promise<void> {
    try {
      await db.insert('email_outbox', {
        to_email: email.to,
        subject: email.subject,
        body: email.body,
        status: 'pending',
      });
    } catch (err) {
      console.error('email_outbox insert failed:', err instanceof Error ? err.message : err);
    }

    console.log(`[email:dev] queued "${email.subject}" to ${email.to}`);
  }
}

let adapter: EmailAdapter | null = null;

export function getEmailAdapter(): EmailAdapter {
  if (!adapter) {
    adapter = new DevOutboxEmailAdapter();
  }
  return adapter;
}

/**
 * IMPORTANT: build `body` only from data the recipient is already allowed
 * to see — published decisions, their own submission. Never pass an internal_reason, a raw mentor comment, or any
 * unpublished row into an email body. Callers in lib/services/* should
 * construct the body from the same role-safe fields the corresponding
 * notification/UI already shows, not from a raw table row.
 */
export async function queueNotificationEmail(toEmail: string, subject: string, body: string) {
  await getEmailAdapter().send({ to: toEmail, subject, body });
}
