/**
 * A mentor moved to another tier keeps their mentor_profiles row, but must
 * drop out of every list of mentors to choose from, and can't be saved as a
 * preferred mentor any more.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/auth/session';
import { SEED, closePool, db, resetTestDb, sessionUser } from './helpers/test-db';

let currentUser: SessionUser | null;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => currentUser }));

const { fetchAllMentorOptions } = await import('@/lib/services/project-mentor');
const { fetchMentorCapacities } = await import('@/lib/services/review-assignment');
const { fetchPublicMentorProfiles } = await import('@/lib/services/mentors');
const { saveIdeaDraft } = await import('@/lib/services/ideas');

const admin = sessionUser(SEED.admin1, ['admin']);
const participant3 = sessionUser(SEED.participant3, ['participant']);

beforeAll(async () => {
  await resetTestDb();
  // Move mentor2 back to the User tier, as User Management would.
  await db.execute(
    `DELETE ur FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = @id AND r.name = 'mentor';
     INSERT INTO user_roles (user_id, role_id) SELECT @id, id FROM roles WHERE name = 'participant';`,
    { id: SEED.mentor2 }
  );
});
afterAll(closePool);
beforeEach(() => {
  currentUser = admin;
});

const ids = (rows: { mentor_profile_id?: string; id?: string }[]) => rows.map((r) => r.mentor_profile_id ?? r.id);

describe('former mentors', () => {
  it('keeps their mentor card', async () => {
    const row = await db.queryOne('SELECT id FROM mentor_profiles WHERE id = @id', { id: SEED.mentorProfile2 });
    expect(row).not.toBeNull();
  });

  it('are left out of the admin pickers and the public directory', async () => {
    for (const list of [await fetchAllMentorOptions(), await fetchMentorCapacities(SEED.program), await fetchPublicMentorProfiles()]) {
      expect(ids(list)).toContain(SEED.mentorProfile1);
      expect(ids(list)).not.toContain(SEED.mentorProfile2);
    }
  });

  it('cannot be saved as a preferred mentor', async () => {
    currentUser = participant3;
    const base = { team_name: 'Former Mentor Team', idea_title: 'Pick a mentor' };

    const rejected = await saveIdeaDraft(SEED.program, null, {
      ...base,
      mentor_preferences: [
        { priority: 1, mentor_profile_id: SEED.mentorProfile1 },
        { priority: 2, mentor_profile_id: SEED.mentorProfile2 },
      ],
    } as any);
    expect(rejected).toEqual({ error: 'One of the preferred mentors is no longer available. Please choose again.' });

    const saved = await saveIdeaDraft(SEED.program, null, {
      ...base,
      mentor_preferences: [{ priority: 1, mentor_profile_id: SEED.mentorProfile1 }],
    } as any);
    expect(saved).toMatchObject({ ok: true });
  });
});
