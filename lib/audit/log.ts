'use server';

import { createClient } from '@/lib/supabase/server';

export interface AuditLogInput {
  programId?: string | null;
  entityType: string;
  entityId: string;
  actorId: string;
  action: string;
  priorValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  correlationId?: string;
}

/**
 * Shared audit-log writer for admin decision actions (screening decisions
 * that differ from the mentor recommendation, manual reviewer changes,
 * etc). Uses the caller's own session client — the admin_only RLS policy on
 * audit_logs (0099_rls.sql) is what actually enforces that only an admin
 * session can write here; this helper doesn't bypass RLS.
 *
 * Some workflow transitions (fn_reopen_review, fn_publish_batch,
 * fn_submit_idea) already write their own audit_logs row inside the
 * Postgres function — don't double-log those from application code, call
 * this helper only for actions decided in application code.
 */
export async function logAudit(input: AuditLogInput) {
  const supabase = await createClient();

  const { error } = await supabase.from('audit_logs').insert({
    program_id: input.programId ?? null,
    entity_type: input.entityType,
    entity_id: input.entityId,
    actor_id: input.actorId,
    action: input.action,
    prior_value: input.priorValue ?? null,
    new_value: input.newValue ?? null,
    reason: input.reason ?? null,
    correlation_id: input.correlationId ?? crypto.randomUUID(),
  });

  if (error) {
    // Never let an audit-write failure block the primary action the caller
    // already committed — surface it in logs for ops to notice instead.
    console.error('logAudit failed:', error.message, input);
  }
}
