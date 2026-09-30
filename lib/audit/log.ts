'use server';

import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';

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
 * etc). audit_logs is an admin-only ledger and this module is a Server
 * Action, so the write is only accepted from an admin session and only in
 * that admin's own name (actorId must be the caller) — otherwise a client
 * could forge audit rows.
 *
 * Some workflow transitions (usp_reopen_review, usp_publish_batch,
 * usp_submit_idea) already write their own audit_logs row inside the
 * stored procedure — don't double-log those from application code, call
 * this helper only for actions decided in application code.
 */
export async function logAudit(input: AuditLogInput) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles) || input.actorId !== user.id) {
    console.error('logAudit rejected: caller is not the admin actor', { action: input.action, entityType: input.entityType });
    return;
  }

  try {
    await db.insert('audit_logs', {
      program_id: input.programId ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId,
      actor_id: input.actorId,
      action: input.action,
      // Stored as JSON text (ck_audit_logs_*_json); stringify explicitly so
      // primitive values are valid JSON too.
      prior_value: input.priorValue === undefined || input.priorValue === null ? null : JSON.stringify(input.priorValue),
      new_value: input.newValue === undefined || input.newValue === null ? null : JSON.stringify(input.newValue),
      reason: input.reason ?? null,
      correlation_id: input.correlationId ?? crypto.randomUUID(),
    });
  } catch (err) {
    // Never let an audit-write failure block the primary action the caller
    // already committed — surface it in logs for ops to notice instead.
    console.error('logAudit failed:', err instanceof Error ? err.message : err, input);
  }
}
