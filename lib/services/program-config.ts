'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import { logAudit } from '@/lib/audit/log';

export interface ProgramRow {
  id: string;
  title: string;
  description: string | null;
  submission_open_at: string | null;
  submission_close_at: string | null;
  screening_close_at: string | null;
  qualifier_close_at: string | null;
  final_presentation_close_at: string | null;
  showcase_open_at: string | null;
  voting_open_at: string | null;
  voting_close_at: string | null;
  status: string;
}

const DATE_FIELDS = [
  'submission_open_at',
  'submission_close_at',
  'screening_close_at',
  'qualifier_close_at',
  'final_presentation_close_at',
  'showcase_open_at',
  'voting_open_at',
  'voting_close_at',
] as const;
export type DateField = (typeof DATE_FIELDS)[number];

export async function fetchActiveProgram(): Promise<ProgramRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('programs').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as ProgramRow) ?? null;
}

/** Save title/description/stage dates. Every change is audit-logged with a
 * per-field before/after so a shifted deadline is traceable later. */
export async function saveProgramConfig(
  programId: string,
  input: { title: string; description: string | null } & Partial<Record<DateField, string | null>>
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const supabase = await createClient();
  const { data: before } = await supabase.from('programs').select('*').eq('id', programId).maybeSingle();
  if (!before) return { error: 'Program not found' } as const;

  const patch: Record<string, unknown> = { title: input.title, description: input.description, updated_at: new Date().toISOString() };
  for (const field of DATE_FIELDS) {
    if (field in input) patch[field] = input[field] ?? null;
  }

  const { error } = await supabase.from('programs').update(patch).eq('id', programId);
  if (error) return { error: error.message } as const;

  await logAudit({
    programId,
    entityType: 'program',
    entityId: programId,
    actorId: user.id,
    action: 'program_config_updated',
    priorValue: before,
    newValue: { ...before, ...patch },
  });

  revalidatePath('/program');
  return { ok: true } as const;
}

/** Quick "open/close now" actions — sets the relevant stage timestamp to
 * the current time without requiring the full date form. Still audited. */
export async function setStageTimestampNow(programId: string, field: DateField) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const supabase = await createClient();
  const { data: before } = await supabase.from('programs').select(field).eq('id', programId).maybeSingle();
  const now = new Date().toISOString();

  const { error } = await supabase.from('programs').update({ [field]: now }).eq('id', programId);
  if (error) return { error: error.message } as const;

  await logAudit({
    programId,
    entityType: 'program',
    entityId: programId,
    actorId: user.id,
    action: `program_${field}_set_now`,
    priorValue: before,
    newValue: { [field]: now },
  });

  revalidatePath('/program');
  return { ok: true } as const;
}

export interface ProgramContentRow {
  id: string;
  key: string;
  title: string | null;
  body: string | null;
}

/** program_content doubles as eligibility/team-rule text (key='eligibility')
 * and FAQ entries (key='faq_<n>'). */
export async function fetchProgramContent(programId: string): Promise<ProgramContentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('program_content').select('*').eq('program_id', programId).order('key');
  return (data ?? []) as ProgramContentRow[];
}

export async function saveProgramContent(programId: string, key: string, title: string | null, body: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const supabase = await createClient();
  const { error } = await supabase
    .from('program_content')
    .upsert({ program_id: programId, key, title, body, updated_at: new Date().toISOString() }, { onConflict: 'program_id,key' });

  if (error) return { error: error.message } as const;
  revalidatePath('/program');
  return { ok: true } as const;
}

export async function deleteProgramContent(contentId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const supabase = await createClient();
  const { error } = await supabase.from('program_content').delete().eq('id', contentId);
  if (error) return { error: error.message } as const;
  revalidatePath('/program');
  return { ok: true } as const;
}

export interface ProgramResourceRow {
  id: string;
  title: string;
  file_url: string;
  file_type: string | null;
  created_at: string;
}

export async function fetchProgramResources(programId: string): Promise<ProgramResourceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('program_resources').select('*').eq('program_id', programId).order('created_at', { ascending: false });
  return (data ?? []) as ProgramResourceRow[];
}

/** Persists a resource row after the file itself has already been uploaded
 * client-side to the program-resources Storage bucket (see
 * 0016_program_resources_storage_bucket.sql). */
export async function addProgramResource(programId: string, title: string, fileUrl: string, fileType: string | null) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;
  if (!fileUrl.includes('/program-resources/')) return { error: 'File URL must point to the program-resources storage bucket' } as const;

  const supabase = await createClient();
  const { error } = await supabase.from('program_resources').insert({ program_id: programId, title, file_url: fileUrl, file_type: fileType });
  if (error) return { error: error.message } as const;
  revalidatePath('/program');
  return { ok: true } as const;
}

export async function deleteProgramResource(resourceId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const supabase = await createClient();
  const { error } = await supabase.from('program_resources').delete().eq('id', resourceId);
  if (error) return { error: error.message } as const;
  revalidatePath('/program');
  return { ok: true } as const;
}
