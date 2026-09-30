'use server';

import { db, likeContains } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';

export interface AuditFilters {
  dateFrom?: string;
  dateTo?: string;
  actor?: string;
  entityType?: string;
  action?: string;
  programId?: string;
  correlationId?: string;
  entityId?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditLogRow {
  id: string;
  program_id: string | null;
  entity_type: string;
  entity_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  prior_value: unknown;
  new_value: unknown;
  reason: string | null;
  correlation_id: string | null;
  created_at: string;
}

/**
 * Admin-only audit trail query (was the audit_logs_admins_only_read RLS
 * policy). A non-admin caller simply gets zero rows back, as before.
 */
export async function fetchAuditLogs(filters: AuditFilters): Promise<{ rows: AuditLogRow[]; total: number }> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { rows: [], total: 0 };

  const page = Math.max(1, Math.floor(Number(filters.page) || 1));
  const pageSize = Math.min(500, Math.max(1, Math.floor(Number(filters.pageSize) || 25)));
  const offset = (page - 1) * pageSize;

  const conds: string[] = [];
  const params: Record<string, unknown> = {};
  if (filters.dateFrom) {
    conds.push('a.created_at >= @dateFrom');
    params.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    conds.push('a.created_at <= @dateTo');
    params.dateTo = filters.dateTo;
  }
  if (filters.entityType) {
    conds.push('a.entity_type = @entityType');
    params.entityType = filters.entityType;
  }
  if (filters.action) {
    conds.push('a.action = @action');
    params.action = filters.action;
  }
  if (filters.programId) {
    conds.push('a.program_id = @programId');
    params.programId = filters.programId;
  }
  if (filters.correlationId) {
    conds.push('a.correlation_id = @correlationId');
    params.correlationId = filters.correlationId;
  }
  if (filters.entityId) {
    conds.push('a.entity_id = @entityId');
    params.entityId = filters.entityId;
  }
  if (filters.actor) {
    conds.push(`a.actor_id IN (SELECT ap.id FROM profiles ap WHERE ap.full_name LIKE @actor)`);
    params.actor = likeContains(filters.actor);
  }
  const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  try {
    const countRow = await db.queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM audit_logs a ${whereSql}`, params);
    const rows = await db.query<AuditLogRow>(
      `SELECT a.id, a.program_id, a.entity_type, a.entity_id, a.actor_id, p.full_name AS actor_name,
              a.action, a.prior_value, a.new_value, a.reason, a.correlation_id, a.created_at
         FROM audit_logs a
         LEFT JOIN profiles p ON p.id = a.actor_id
         ${whereSql}
        ORDER BY a.created_at DESC, a.id
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
      { ...params, offset, pageSize }
    );
    return { rows, total: countRow?.count ?? rows.length };
  } catch {
    // Malformed filter values (e.g. a non-GUID entity id or bad date) used to
    // come back as a query error with no rows; keep that behaviour.
    return { rows: [], total: 0 };
  }
}

/** Distinct entity_type / action values currently in the log, for filter dropdowns. Admin-only. */
export async function fetchAuditFacets(): Promise<{ entityTypes: string[]; actions: string[] }> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { entityTypes: [], actions: [] };

  const [types, actions] = await Promise.all([
    db.query<{ entity_type: string }>('SELECT DISTINCT entity_type FROM audit_logs ORDER BY entity_type'),
    db.query<{ action: string }>('SELECT DISTINCT action FROM audit_logs ORDER BY action'),
  ]);
  return { entityTypes: types.map((r) => r.entity_type), actions: actions.map((r) => r.action) };
}
