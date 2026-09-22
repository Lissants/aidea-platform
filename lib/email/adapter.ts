import 'server-only';
import { createClient } from '@/lib/supabase/server';

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
 * TODO(production): implement a second adapter here backed by Microsoft
 * Graph `sendMail` (using MICROSOFT_TENANT_ID/CLIENT_ID/CLIENT_SECRET from
 * .env.example) or SMTP (EMAIL_PROVIDER/EMAIL_FROM), and select between
 * them with `EMAIL_PROVIDER`. Keep the same `EmailAdapter` interface so
 * call sites never change.
 */
class DevOutboxEmailAdapter implements EmailAdapter {
  async send(email: OutgoingEmail): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from('email_outbox').insert({
      to_email: email.to,
      subject: email.subject,
      body: email.body,
      status: 'pending',
    });

    if (error) {
      console.error('email_outbox insert failed:', error.message);
    }

    // eslint-disable-next-line no-console
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
 * to see — published decisions, their own submission, public showcase
 * content. Never pass an internal_reason, a raw mentor comment, or any
 * unpublished row into an email body. Callers in lib/services/* should
 * construct the body from the same role-safe fields the corresponding
 * notification/UI already shows, not from a raw table row.
 */
export async function queueNotificationEmail(toEmail: string, subject: string, body: string) {
  await getEmailAdapter().send({ to: toEmail, subject, body });
}
