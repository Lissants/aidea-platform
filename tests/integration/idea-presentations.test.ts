/**
 * The two presentation slots (migrations 0010 + 0017) through
 * app/api/ideas/[ideaId]/presentation against the real aidea_test database:
 *  - the screening slot opens at a published screening Pass, the final slot
 *    at a published Build;
 *  - each slot writes its own columns and replaces only its own file;
 *  - the same file is refused in both slots;
 *  - only the team (or an admin) can upload.
 * Files go to a temporary UPLOAD_DIR that is removed afterwards.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/auth/session';
import { SEED, closePool, db, resetTestDb, sessionUser } from './helpers/test-db';

let currentUser: SessionUser | null;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => currentUser }));

const { POST } = await import('@/app/api/ideas/[ideaId]/presentation/route');
const { parseFileUrl, uploadRoot } = await import('@/lib/storage/local');

const leader = sessionUser(SEED.participant3, ['participant']);
const outsider = sessionUser(SEED.participant2, ['participant']);

const uploadDir = mkdtempSync(path.join(os.tmpdir(), 'aidea-presentations-'));
const previousUploadDir = process.env.UPLOAD_DIR;

/** A minimal valid PDF body; `tag` makes the bytes unique. */
function pdf(name: string, tag: string) {
  return new File([`%PDF-1.4\n% ${tag}\n%%EOF\n`], name, { type: 'application/pdf' });
}

async function upload(ideaId: string, file: File, stage?: 'screening' | 'final') {
  const body = new FormData();
  body.set('file', file);
  const url = `http://localhost/api/ideas/${ideaId}/presentation${stage ? `?stage=${stage}` : ''}`;
  const res = await POST(new NextRequest(url, { method: 'POST', body }), { params: Promise.resolve({ ideaId }) });
  return { status: res.status, json: (await res.json()) as { url?: string; name?: string; error?: string } };
}

async function slots(ideaId: string) {
  return db.queryOne<{
    presentation_url: string | null;
    presentation_name: string | null;
    screening_presentation_url: string | null;
    screening_presentation_name: string | null;
    screening_presentation_uploaded_by: string | null;
  }>(
    `SELECT presentation_url, presentation_name, screening_presentation_url, screening_presentation_name,
            screening_presentation_uploaded_by
       FROM ideas WHERE id = @ideaId`,
    { ideaId }
  );
}

const storedPath = (url: string) => {
  const parsed = parseFileUrl(url)!;
  return path.join(uploadRoot(), parsed.bucket, parsed.key);
};

/** A submitted idea led by participant3 with the published results asked for. */
async function createIdea(results: { pass?: boolean; build?: boolean }) {
  const id = randomUUID();
  await db.execute(
    `INSERT INTO ideas (id, program_id, team_name, team_leader_id, idea_title, problem_opportunity,
                        proposed_solution, status, locked, created_by)
     VALUES (@id, @program, N'Deck Team', @leader, N'Deck idea', N'Problem', N'Solution', 'submitted', 1, @leader)`,
    { id, program: SEED.program, leader: SEED.participant3 }
  );
  if (results.pass) {
    await db.execute(
      `INSERT INTO screening_decisions (idea_id, decision, decided_at, published, published_at)
       VALUES (@id, 'pass_to_qualifier', SYSDATETIMEOFFSET(), 1, SYSDATETIMEOFFSET())`,
      { id }
    );
  }
  if (results.build) {
    await db.execute(
      `INSERT INTO qualifier_assessments (idea_id, final_score, overall_comment, build_decision, status, finalized_at,
                                          published, published_at)
       VALUES (@id, 80, N'Build it.', 'build', 'finalized', SYSDATETIMEOFFSET(), 1, SYSDATETIMEOFFSET())`,
      { id }
    );
  }
  return id;
}

beforeAll(async () => {
  process.env.UPLOAD_DIR = uploadDir;
  await resetTestDb();
});

afterAll(async () => {
  if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = previousUploadDir;
  rmSync(uploadDir, { recursive: true, force: true });
  await closePool();
});

describe('presentation upload slots', () => {
  it('keeps both slots closed until the screening result is published as Pass', async () => {
    const id = await createIdea({});
    currentUser = leader;
    const screening = await upload(id, pdf('screening.pdf', 'a'), 'screening');
    expect(screening.status).toBe(403);
    expect(screening.json.error).toMatch(/passes your idea at screening/);
    expect((await upload(id, pdf('final.pdf', 'b'), 'final')).status).toBe(403);
  });

  it('opens only the screening slot after a published Pass', async () => {
    const id = await createIdea({ pass: true });
    currentUser = leader;
    const screening = await upload(id, pdf('screening.pdf', 'pass-only'), 'screening');
    expect(screening.status).toBe(200);
    expect(screening.json.name).toBe('screening.pdf');

    const final = await upload(id, pdf('final.pdf', 'pass-only-final'), 'final');
    expect(final.status).toBe(403);
    expect(final.json.error).toMatch(/marked Build/);

    const row = await slots(id);
    expect(row?.screening_presentation_url).toBe(screening.json.url);
    expect(row?.screening_presentation_uploaded_by?.toLowerCase()).toBe(SEED.participant3);
    expect(row?.presentation_url).toBeNull();
  });

  it('stores the two decks separately and replaces only the re-uploaded slot', async () => {
    const id = await createIdea({ pass: true, build: true });
    currentUser = leader;
    const screening = await upload(id, pdf('screening.pdf', 'one'), 'screening');
    const final = await upload(id, pdf('final.pdf', 'two')); // no stage = final, as before
    expect([screening.status, final.status]).toEqual([200, 200]);

    let row = await slots(id);
    expect(row?.screening_presentation_name).toBe('screening.pdf');
    expect(row?.presentation_name).toBe('final.pdf');

    const replaced = await upload(id, pdf('screening-v2.pdf', 'three'), 'screening');
    expect(replaced.status).toBe(200);
    row = await slots(id);
    expect(row?.screening_presentation_name).toBe('screening-v2.pdf');
    expect(row?.presentation_url).toBe(final.json.url);
    expect(existsSync(storedPath(screening.json.url!))).toBe(false);
    expect(existsSync(storedPath(replaced.json.url!))).toBe(true);
    expect(existsSync(storedPath(final.json.url!))).toBe(true);
  });

  it('refuses the same file in both slots, whatever its name', async () => {
    const id = await createIdea({ pass: true, build: true });
    currentUser = leader;
    expect((await upload(id, pdf('deck.pdf', 'same'), 'screening')).status).toBe(200);

    const dup = await upload(id, pdf('renamed-deck.pdf', 'same'), 'final');
    expect(dup.status).toBe(400);
    expect(dup.json.error).toBe('This is the same file as your Qualifier Presentation. Upload a different deck.');
    expect((await slots(id))?.presentation_url).toBeNull();

    // Re-uploading the same file into its own slot is still allowed.
    expect((await upload(id, pdf('deck.pdf', 'same'), 'screening')).status).toBe(200);
  });

  it('refuses people outside the team and unknown slot names', async () => {
    const id = await createIdea({ pass: true });
    currentUser = outsider;
    expect((await upload(id, pdf('x.pdf', 'outsider'), 'screening')).status).toBe(403);

    currentUser = leader;
    const body = new FormData();
    body.set('file', pdf('x.pdf', 'bad-stage'));
    const res = await POST(
      new NextRequest(`http://localhost/api/ideas/${id}/presentation?stage=other`, { method: 'POST', body }),
      { params: Promise.resolve({ ideaId: id }) }
    );
    expect(res.status).toBe(400);
  });
});
