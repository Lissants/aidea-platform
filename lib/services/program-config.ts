'use server';

import { revalidatePath } from 'next/cache';
import { attempt, db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import { logAudit } from '@/lib/audit/log';
import { parseFileUrl, removeByUrl } from '@/lib/storage/local';
import { sanitizeTimelineTba, type TimelineTba } from '@/lib/program/timeline';

export interface ProgramRow {
  id: string;
  title: string;
  description: string | null;
  submission_open_at: string | null;
  submission_close_at: string | null;
  screening_close_at: string | null;
  qualifier_close_at: string | null;
  final_presentation_close_at: string | null;
  voting_open_at: string | null;
  voting_close_at: string | null;
  timeline_tba: string | null;
  status: string;
}

const DATE_FIELDS = [
  'submission_open_at',
  'submission_close_at',
  'screening_close_at',
  'qualifier_close_at',
  'final_presentation_close_at',
  'voting_open_at',
  'voting_close_at',
] as const;
export type DateField = (typeof DATE_FIELDS)[number];

function isDateField(value: unknown): value is DateField {
  return typeof value === 'string' && (DATE_FIELDS as readonly string[]).includes(value);
}

/** Programs are readable by any signed-in user (was programs_select_authenticated). */
export async function fetchActiveProgram(): Promise<ProgramRow | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return db.queryOne<ProgramRow>('SELECT TOP (1) * FROM programs ORDER BY created_at DESC');
}

/** Save title/description/stage dates. Every change is audit-logged with a
 * per-field before/after so a shifted deadline is traceable later. */
export async function saveProgramConfig(
  programId: string,
  input: { title: string; description: string | null; timelineTba?: TimelineTba } & Partial<Record<DateField, string | null>>
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const before = await db.queryOne<ProgramRow>('SELECT * FROM programs WHERE id = @programId', { programId });
  if (!before) return { error: 'Program not found' } as const;

  const patch: Record<string, unknown> = { title: input.title, description: input.description, updated_at: new Date().toISOString() };
  for (const field of DATE_FIELDS) {
    if (field in input) patch[field] = input[field] ?? null;
  }
  if (input.timelineTba !== undefined) {
    const tba = sanitizeTimelineTba(input.timelineTba);
    patch.timeline_tba = Object.keys(tba).length ? JSON.stringify(tba) : null;
  }

  const { error } = await attempt(() => db.update('programs', patch, 'id = @programId', { programId }));
  if (error) return { error } as const;

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
  revalidatePath('/overview');
  revalidatePath('/submit');
  return { ok: true } as const;
}

/** Quick "open/close now" actions — sets the relevant stage timestamp to
 * the current time without requiring the full date form. Still audited. */
export async function setStageTimestampNow(programId: string, field: DateField) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;
  // `field` becomes a column name, so only the known stage columns are allowed.
  if (!isDateField(field)) return { error: 'Unknown stage field' } as const;

  const before = await db.queryOne<Record<string, unknown>>(`SELECT [${field}] FROM programs WHERE id = @programId`, { programId });
  if (!before) return { error: 'Program not found' } as const;
  const now = new Date().toISOString();

  const { error } = await attempt(() => db.update('programs', { [field]: now }, 'id = @programId', { programId }));
  if (error) return { error } as const;

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
 * and FAQ entries (key='faq_<n>'). Readable by any signed-in user. */
export async function fetchProgramContent(programId: string): Promise<ProgramContentRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return db.query<ProgramContentRow>('SELECT * FROM program_content WHERE program_id = @programId ORDER BY [key]', { programId });
}

export async function saveProgramContent(programId: string, key: string, title: string | null, body: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const { error } = await attempt(() =>
    db.execute(
      `MERGE program_content WITH (HOLDLOCK) AS t
       USING (SELECT @programId AS program_id, @key AS [key]) AS s
          ON t.program_id = s.program_id AND t.[key] = s.[key]
       WHEN MATCHED THEN UPDATE SET title = @title, body = @body, updated_at = SYSDATETIMEOFFSET()
       WHEN NOT MATCHED THEN INSERT (program_id, [key], title, body, updated_at)
         VALUES (@programId, @key, @title, @body, SYSDATETIMEOFFSET());`,
      { programId, key, title, body }
    )
  );

  if (error) return { error } as const;
  revalidatePath('/program');
  return { ok: true } as const;
}

export async function deleteProgramContent(contentId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const { error } = await attempt(() => db.execute('DELETE FROM program_content WHERE id = @contentId', { contentId }));
  if (error) return { error } as const;
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

/** Readable by any signed-in user (was program_resources_select_authenticated). */
export async function fetchProgramResources(programId: string): Promise<ProgramResourceRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return db.query<ProgramResourceRow>(
    'SELECT * FROM program_resources WHERE program_id = @programId ORDER BY created_at DESC',
    { programId }
  );
}

/** Persists a resource row after the file itself has already been uploaded
 * to the program-resources bucket through /api/files/program-resources
 * (admin-only; see lib/storage/local.ts). The URL must resolve to a file
 * in that bucket. */
export async function addProgramResource(programId: string, title: string, fileUrl: string, fileType: string | null) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;
  const file = typeof fileUrl === 'string' ? parseFileUrl(fileUrl) : null;
  if (!file || file.bucket !== 'program-resources') {
    return { error: 'File URL must point to the program-resources storage bucket' } as const;
  }

  const { error } = await attempt(() =>
    db.insert('program_resources', { program_id: programId, title, file_url: fileUrl, file_type: fileType })
  );
  if (error) return { error } as const;
  revalidatePath('/program');
  return { ok: true } as const;
}

export async function deleteProgramResource(resourceId: string) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) return { error: 'Not authorized' } as const;

  const { data: existing, error: readError } = await attempt(() =>
    db.queryOne<{ file_url: string }>('SELECT file_url FROM program_resources WHERE id = @resourceId', { resourceId })
  );
  if (readError) return { error: readError } as const;

  const { error } = await attempt(() => db.execute('DELETE FROM program_resources WHERE id = @resourceId', { resourceId }));
  if (error) return { error } as const;

  // Best-effort: remove the stored file so orphans don't pile up.
  if (existing?.file_url) await removeByUrl(existing.file_url);

  revalidatePath('/program');
  return { ok: true } as const;
}
