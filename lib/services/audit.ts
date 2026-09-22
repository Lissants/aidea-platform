'use server';

import { createClient } from '@/lib/supabase/server';

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
 * Admin-only audit trail query. RLS's audit_logs_admins_only_read policy
 * (0099_rls.sql) is the real gate — a non-admin session simply gets zero
 * rows back, this never needs its own additional authorization check.
 */
export async function fetchAuditLogs(filters: AuditFilters): Promise<{ rows: AuditLogRow[]; total: number }> {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('audit_logs')
    .select('*, profiles:actor_id (full_name)', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo);
  if (filters.entityType) query = query.eq('entity_type', filters.entityType);
  if (filters.action) query = query.eq('action', filters.action);
  if (filters.programId) query = query.eq('program_id', filters.programId);
  if (filters.correlationId) query = query.eq('correlation_id', filters.correlationId);
  if (filters.entityId) query = query.eq('entity_id', filters.entityId);

  if (filters.actor) {
    const { data: matches } = await supabase.from('profiles').select('id').ilike('full_name', `%${filters.actor}%`);
    const ids = (matches ?? []).map((m) => m.id);
    query = query.in('actor_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']);
  }

  const { data, count, error } = await query.range(from, to);
  if (error || !data) return { rows: [], total: 0 };

  const rows: AuditLogRow[] = (data as any[]).map((r) => ({
    id: r.id,
    program_id: r.program_id,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    actor_id: r.actor_id,
    actor_name: r.profiles?.full_name ?? null,
    action: r.action,
    prior_value: r.prior_value,
    new_value: r.new_value,
    reason: r.reason,
    correlation_id: r.correlation_id,
    created_at: r.created_at,
  }));

  return { rows, total: count ?? rows.length };
}

/** Distinct entity_type / action values currently in the log, for filter dropdowns. */
export async function fetchAuditFacets(): Promise<{ entityTypes: string[]; actions: string[] }> {
  const supabase = await createClient();
  const { data } = await supabase.from('audit_logs').select('entity_type, action').limit(2000);
  const entityTypes = Array.from(new Set((data ?? []).map((r) => r.entity_type))).sort();
  const actions = Array.from(new Set((data ?? []).map((r) => r.action))).sort();
  return { entityTypes, actions };
}
