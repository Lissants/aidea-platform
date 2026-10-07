/**
 * Team membership rules (db/migrations/0009_team_membership.sql,
 * 0012_commit_on_build.sql) against the real aidea_test database:
 *  - until an idea is marked Build a person may lead / be a member of several ideas;
 *  - once 1+ of their ideas is marked Build (published) while they are on
 *    other in-progress ideas, they commit to a Build idea and are dropped
 *    from the others (leaving as leader vacates the slot);
 *  - admins remove members from submitted ideas and assign replacements /
 *    new leaders, with an eligibility check that can be overridden.
 *
 * Every scenario creates its own people, so scenarios don't share state.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/auth/session';
import { newId } from '@/lib/db';
import { SEED, closePool, db, resetTestDb, sessionUser } from './helpers/test-db';

let currentUser: SessionUser | null;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: async () => currentUser }));

const { submitIdeaDraft, saveIdeaDraft } = await import('@/lib/services/ideas');
const {
  commitToIdea,
  fetchMyMembershipConflicts,
  adminRemoveTeamMember,
  adminAddTeamMember,
  searchReplacementCandidates,
} = await import('@/lib/services/team-membership');

const admin = sessionUser(SEED.admin1, ['admin']);
const as = (id: string) => (currentUser = sessionUser(id, ['participant']));

let seq = 0;
/** Creates active employees; returns their profile ids keyed by the given labels. */
async function people<const L extends readonly string[]>(...labels: L): Promise<{ [K in L[number]]: string }> {
  const out = {} as { [K in L[number]]: string };
  for (const label of labels) {
    const id = newId();
    const email = `tm.${label.toLowerCase()}.${++seq}.${id.slice(0, 8)}@test.local`;
    await db.insert('users', { id, email });
    await db.insert('profiles', { id, email, full_name: `Person ${label}${seq}`, active: true });
    out[label as L[number]] = id;
  }
  return out;
}

function ideaInput(title: string, leader: string, members: string[]) {
  return {
    team_name: `Team ${title}`,
    idea_title: title,
    problem_opportunity: 'Warehouses run out of stock unpredictably every month.',
    proposed_solution: 'Use demand forecasting to flag shortages a week early.',
    target_users: null,
    team_leader_id: leader,
    team_members: members.map((profile_id, i) => ({ profile_id, member_order: i + 1 })),
    impacts: [{ impact_kind: 'primary' as const, impact_type: 'cost_optimization' as const, explanation: 'Less expedited freight.' }],
    support_requests: [],
    mentor_preferences: [],
  };
}

/** Submits an idea as `creator` (defaults to the leader) and returns its id; throws on failure. */
async function submit(title: string, leader: string, members: string[], creator = leader) {
  as(creator);
  const result = await submitIdeaDraft(SEED.program, null, ideaInput(title, leader, members));
  if (!('ok' in result) || !result.ideaId) throw new Error(`submit "${title}" failed: ${'error' in result ? result.error : ''}`);
  return result.ideaId;
}

async function trySubmit(title: string, leader: string, members: string[], creator = leader) {
  as(creator);
  return submitIdeaDraft(SEED.program, null, ideaInput(title, leader, members));
}

/** Records and publishes screening decisions (default: Pass) for the given ideas. */
async function screen(ideaIds: string[], decision: 'pass_to_qualifier' | 'not_pass' = 'pass_to_qualifier', publish = true) {
  for (const idea_id of ideaIds) {
    await db.execute(
      `INSERT INTO screening_decisions (idea_id, decision, decided_by, decided_at)
       VALUES (@idea_id, @decision, @admin, SYSDATETIMEOFFSET())`,
      { idea_id, decision, admin: SEED.admin1 }
    );
  }
  if (publish) {
    await db.callProc('usp_publish_batch', { program_id: SEED.program, entity_type: 'screening_decision', actor_id: SEED.admin1 });
  }
}

/** Passes screening (if not yet screened), then records and publishes qualifier decisions (default: Build). */
async function qualify(ideaIds: string[], decision: 'build' | 'no_build' = 'build', publish = true) {
  const unscreened = [];
  for (const idea_id of ideaIds) {
    const sd = await db.queryOne('SELECT id FROM screening_decisions WHERE idea_id = @idea_id', { idea_id });
    if (!sd) unscreened.push(idea_id);
  }
  if (unscreened.length) await screen(unscreened);
  for (const idea_id of ideaIds) {
    await db.execute(
      `INSERT INTO qualifier_assessments (idea_id, final_score, build_decision, status, finalized_at, decided_by)
       VALUES (@idea_id, 80, @decision, 'finalized', SYSDATETIMEOFFSET(), @admin)`,
      { idea_id, decision, admin: SEED.admin1 }
    );
  }
  if (publish) {
    await db.callProc('usp_publish_batch', { program_id: SEED.program, entity_type: 'qualifier_assessment', actor_id: SEED.admin1 });
  }
}

const team = async (ideaId: string) => {
  const idea = await db.queryOne<{ team_leader_id: string | null }>('SELECT team_leader_id FROM ideas WHERE id = @ideaId', {
    ideaId,
  });
  const members = await db.query<{ profile_id: string }>(
    'SELECT profile_id FROM idea_team_members WHERE idea_id = @ideaId ORDER BY member_order',
    { ideaId }
  );
  return { leader: idea?.team_leader_id ?? null, members: members.map((m) => m.profile_id) };
};

const conflictsOf = async (id: string) => {
  as(id);
  return (await fetchMyMembershipConflicts()).map((c) => c.idea_id).sort();
};

beforeAll(resetTestDb);
afterAll(closePool);
beforeEach(() => {
  currentUser = null;
});

describe('S1: Team Leader A submits 1 idea with members B, C, D, E', () => {
  it('submits, and after being marked Build nobody has a conflict (nothing else to leave)', async () => {
    const p = await people('A', 'B', 'C', 'D', 'E');
    const idea = await submit('S1 idea', p.A, [p.B, p.C, p.D, p.E]);
    expect(await team(idea)).toEqual({ leader: p.A, members: [p.B, p.C, p.D, p.E] });
    await qualify([idea]);
    for (const id of Object.values(p)) expect(await conflictsOf(id)).toEqual([]);
  });
});

describe('S2: Team Leader A submits 2 ideas, both with members B, C, D, E', () => {
  it('passing screening is not enough; once both are Build everyone must choose; commits drop people from the other idea', async () => {
    const p = await people('A', 'B', 'C', 'D', 'E');
    const idea1 = await submit('S2 idea one', p.A, [p.B, p.C, p.D, p.E]);
    const idea2 = await submit('S2 idea two', p.A, [p.B, p.C, p.D, p.E]);

    // Before any Build: no conflict for anyone, even after both pass screening.
    expect(await conflictsOf(p.A)).toEqual([]);
    await screen([idea1, idea2]);
    for (const id of Object.values(p)) expect(await conflictsOf(id)).toEqual([]);

    await qualify([idea1, idea2]);
    for (const id of Object.values(p)) expect(await conflictsOf(id)).toEqual([idea1, idea2].sort());

    as(p.A);
    const a = await commitToIdea(idea1);
    expect(a).toMatchObject({ ok: true, leftCount: 1 });
    expect((await team(idea2)).leader).toBeNull(); // A led idea 2: slot now vacant
    expect((await team(idea1)).leader).toBe(p.A);
    expect(await conflictsOf(p.A)).toEqual([]);

    as(p.B);
    expect(await commitToIdea(idea2)).toMatchObject({ ok: true, leftCount: 1 });
    expect((await team(idea1)).members).not.toContain(p.B);
    expect((await team(idea2)).members).toContain(p.B);

    // Admins were told about the vacant leader slot; idea 2's team was told A left.
    const notes = await db.query<{ type: string; user_id: string }>(
      `SELECT type, user_id FROM notifications WHERE type IN ('team_leader_vacant', 'team_member_left')`
    );
    expect(notes.some((n) => n.type === 'team_leader_vacant' && n.user_id === SEED.admin1)).toBe(true);
    expect(notes.some((n) => n.type === 'team_member_left' && n.user_id === p.C)).toBe(true);
    const audit = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'team_member_committed_elsewhere' AND actor_id = @a`,
      { a: p.A }
    );
    expect(audit?.count).toBe(1);
  });
});

describe('S3: Team Leader A submits 2 ideas: B, C, D, E and V, W, X, Y', () => {
  it('only A has a conflict; after A commits, the other idea has a vacant leader that an admin fills', async () => {
    const p = await people('A', 'B', 'C', 'D', 'E', 'V', 'W', 'X', 'Y');
    const idea1 = await submit('S3 idea one', p.A, [p.B, p.C, p.D, p.E]);
    const idea2 = await submit('S3 idea two', p.A, [p.V, p.W, p.X, p.Y]);
    // Only idea 1 is Build; idea 2 is still waiting on the qualifier.
    await screen([idea2]);
    await qualify([idea1]);

    expect(await conflictsOf(p.A)).toEqual([idea1, idea2].sort());
    for (const id of [p.B, p.V, p.Y]) expect(await conflictsOf(id)).toEqual([]);

    as(p.A);
    await commitToIdea(idea1);
    expect(await team(idea2)).toEqual({ leader: null, members: [p.V, p.W, p.X, p.Y] });

    currentUser = admin;
    expect(await adminAddTeamMember(idea2, p.V, { asLeader: true, override: false })).toEqual({ ok: true });
    expect(await team(idea2)).toEqual({ leader: p.V, members: [p.W, p.X, p.Y] });
  });
});

describe('S4: Team Leader B submits an idea with members A, B, C, D', () => {
  it('is rejected because the leader is also listed as a member', async () => {
    const p = await people('A', 'B', 'C', 'D');
    const result = await trySubmit('S4 idea', p.B, [p.A, p.B, p.C, p.D]);
    expect('error' in result && result.error).toMatch(/leader cannot also be listed/i);
  });

  it('without B as a member it submits, so B can lead one idea and be a member of A\'s idea before approval', async () => {
    const p = await people('A', 'B', 'C', 'D', 'E');
    await submit('S4 A idea', p.A, [p.B, p.C, p.D, p.E]);
    const result = await trySubmit('S4 B idea', p.B, [p.A, p.C, p.D]);
    expect('ok' in result).toBe(true);
  });
});

describe('edge cases: idea submission', () => {
  it('E1: rejects the same member listed twice', async () => {
    const p = await people('A', 'B');
    const result = await trySubmit('E1 idea', p.A, [p.B, p.B]);
    expect('error' in result && result.error).toMatch(/more than once/i);
  });

  it('E2: rejects 6 members', async () => {
    const p = await people('A', 'B', 'C', 'D', 'E', 'F', 'G');
    const result = await trySubmit('E2 idea', p.A, [p.B, p.C, p.D, p.E, p.F, p.G]);
    expect('error' in result && result.error).toMatch(/at most 5/i);
  });

  it('E8: a person on a Build idea cannot be put on a new idea (leader, member or draft)', async () => {
    const p = await people('A', 'B', 'C');
    const idea = await submit('E8 build', p.A, [p.B]);
    await screen([idea]);
    // A screening Pass alone does not lock the team.
    expect('ok' in (await trySubmit('E8 before build', p.C, [p.B]))).toBe(true);
    await qualify([idea]);

    const asMember = await trySubmit('E8 new', p.C, [p.B]);
    expect('error' in asMember && asMember.error).toMatch(/already committed/i);
    const asLeader = await trySubmit('E8 new 2', p.A, [p.C]);
    expect('error' in asLeader && asLeader.error).toMatch(/already committed/i);

    as(p.C);
    const draft = await saveIdeaDraft(SEED.program, null, { idea_title: 'E8 draft', team_members: [{ profile_id: p.B, member_order: 1 }] });
    expect('error' in draft).toBe(true);
  });
});

describe('edge cases: committing', () => {
  it('E3: on 3 Build ideas, one commit drops the person from the other 2', async () => {
    const p = await people('A', 'B', 'C', 'D');
    const i1 = await submit('E3 one', p.A, [p.B]);
    const i2 = await submit('E3 two', p.C, [p.A]);
    const i3 = await submit('E3 three', p.D, [p.A]);
    await qualify([i1, i2, i3]);
    as(p.A);
    expect(await commitToIdea(i2)).toMatchObject({ ok: true, leftCount: 2 });
    expect((await team(i1)).leader).toBeNull();
    expect((await team(i3)).members).toEqual([]);
    expect((await team(i2)).members).toEqual([p.A]);
  });

  it('E3b: one Build idea and one still under review -> must commit, and leaves the one under review', async () => {
    const p = await people('A', 'B', 'C');
    const build = await submit('E3b build', p.A, [p.B]);
    const pending = await submit('E3b pending', p.C, [p.A]);
    await qualify([build]);
    expect(await conflictsOf(p.A)).toEqual([build, pending].sort());
    expect(await conflictsOf(p.C)).toEqual([]);

    as(p.A);
    const rows = await fetchMyMembershipConflicts();
    expect(rows.find((r) => r.idea_id === build)?.is_build).toBe(true);
    expect(rows.find((r) => r.idea_id === pending)?.is_build).toBe(false);
    // The idea that is not Build cannot be the one kept.
    expect(await commitToIdea(pending)).toMatchObject({ error: expect.stringMatching(/marked Build/i) });

    expect(await commitToIdea(build)).toMatchObject({ ok: true, leftCount: 1 });
    expect((await team(pending)).members).toEqual([]);
    expect(await conflictsOf(p.A)).toEqual([]);
  });

  it('E4: Build plus an idea that already ended (Not Pass / No Build) -> no conflict, nobody dropped', async () => {
    const p = await people('A', 'B');
    const build = await submit('E4 build', p.A, [p.B]);
    const fail = await submit('E4 fail', p.A, [p.B]);
    const noBuild = await submit('E4 no build', p.A, [p.B]);
    await screen([fail], 'not_pass');
    await qualify([build]);
    await qualify([noBuild], 'no_build');
    expect(await conflictsOf(p.A)).toEqual([]);
    expect(await team(fail)).toEqual({ leader: p.A, members: [p.B] });
    expect(await team(noBuild)).toEqual({ leader: p.A, members: [p.B] });
  });

  it('E5: a finalized but unpublished Build is not a trigger yet', async () => {
    const p = await people('A', 'B');
    const i1 = await submit('E5 one', p.A, [p.B]);
    const i2 = await submit('E5 two', p.A, [p.B]);
    await qualify([i1], 'build', false);
    expect(await conflictsOf(p.A)).toEqual([]);
    // Publish so later tests' publishes don't sweep these in unexpectedly.
    await db.callProc('usp_publish_batch', { program_id: SEED.program, entity_type: 'qualifier_assessment', actor_id: SEED.admin1 });
    expect(await conflictsOf(p.A)).toEqual([i1, i2].sort());
  });

  it("E6: can't commit to an idea you are not on, or one that isn't marked Build", async () => {
    const p = await people('A', 'B', 'C');
    const mine = await submit('E6 mine', p.A, [p.B]);
    const other = await submit('E6 other', p.C, []);
    const passedOnly = await submit('E6 passed only', p.A, []);
    await screen([passedOnly]);
    await qualify([mine, other]);
    as(p.A);
    expect(await commitToIdea(other)).toMatchObject({ error: expect.stringMatching(/not on this idea/i) });
    expect(await commitToIdea(passedOnly)).toMatchObject({ error: expect.stringMatching(/marked Build/i) });
  });

  it('E7: committing again is a no-op; two concurrent commits leave a consistent state', async () => {
    const p = await people('A', 'B');
    const i1 = await submit('E7 one', p.A, [p.B]);
    const i2 = await submit('E7 two', p.A, [p.B]);
    await qualify([i1, i2]);

    as(p.B);
    const results = await Promise.all([commitToIdea(i1), commitToIdea(i2)]);
    // One wins; the other either has nothing left to do or fails because B already left that idea.
    expect(results.some((r) => 'ok' in r)).toBe(true);
    const onTeams = [(await team(i1)).members.includes(p.B), (await team(i2)).members.includes(p.B)];
    expect(onTeams.filter(Boolean)).toHaveLength(1);

    const kept = onTeams[0] ? i1 : i2;
    expect(await commitToIdea(kept)).toMatchObject({ ok: true, leftCount: 0 });
  });

  it('E15: a creator who is not on the team keeps visibility of the idea', async () => {
    const p = await people('Creator', 'A', 'B');
    const idea = await submit('E15 idea', p.A, [p.B], p.Creator);
    const row = await db.queryOne<{ created_by: string }>('SELECT created_by FROM ideas WHERE id = @idea', { idea });
    expect(row?.created_by).toBe(p.Creator);
    // Not on the team, so never in a conflict and never "committed".
    expect(await conflictsOf(p.Creator)).toEqual([]);
  });
});

describe('edge cases: admin team changes', () => {
  it('E9: removes a member / the leader with a reason, writes audit + notification', async () => {
    const p = await people('A', 'B', 'C');
    const idea = await submit('E9 idea', p.A, [p.B, p.C]);
    currentUser = admin;

    expect(await adminRemoveTeamMember(idea, p.B, '')).toMatchObject({ error: expect.any(String) });
    expect(await adminRemoveTeamMember(idea, p.B, 'Resigned from the company')).toEqual({ ok: true });
    expect(await adminRemoveTeamMember(idea, p.A, 'Maternity leave')).toEqual({ ok: true });
    expect(await team(idea)).toEqual({ leader: null, members: [p.C] });

    const audit = await db.query<{ action: string; reason: string }>(
      `SELECT action, reason FROM audit_logs WHERE entity_id = @idea AND action = 'team_member_removed'`,
      { idea }
    );
    expect(audit.map((a) => a.reason).sort()).toEqual(['Maternity leave', 'Resigned from the company']);
    const note = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = @b AND type = 'team_member_removed'`,
      { b: p.B }
    );
    expect(note?.count).toBe(1);
  });

  it('E10: replacement on another submitted idea is blocked unless overridden with a reason', async () => {
    const p = await people('A', 'B', 'R', 'S', 'Free');
    const idea = await submit('E10 idea', p.A, [p.B]);
    await submit('E10 other', p.R, [p.S]);
    currentUser = admin;

    const candidates = await searchReplacementCandidates(idea, 'Person R');
    expect(candidates.find((c) => c.id === p.R)?.conflict_idea_title).toBe('E10 other');

    expect(await adminAddTeamMember(idea, p.S, { asLeader: false, override: false })).toMatchObject({
      error: expect.stringMatching(/already on the submitted idea/i),
    });
    expect(await adminAddTeamMember(idea, p.S, { asLeader: false, override: true, reason: '' })).toMatchObject({
      error: expect.any(String),
    });
    expect(
      await adminAddTeamMember(idea, p.S, { asLeader: false, override: true, reason: 'Approved by the program lead' })
    ).toEqual({ ok: true });
    expect(await adminAddTeamMember(idea, p.Free, { asLeader: false, override: false })).toEqual({ ok: true });
    expect((await team(idea)).members).toEqual([p.B, p.S, p.Free]);

    const audit = await db.queryOne<{ new_value: { eligibility_override: boolean }; reason: string }>(
      `SELECT new_value, reason FROM audit_logs WHERE entity_id = @idea AND action = 'team_member_added'
          AND reason = 'Approved by the program lead'`,
      { idea }
    );
    expect(audit?.new_value.eligibility_override).toBe(true);
  });

  it('E11: rejects a 6th member, inactive profile, someone already on the team, or a leader when one exists', async () => {
    const p = await people('A', 'B', 'C', 'D', 'E', 'F', 'G', 'Gone');
    const idea = await submit('E11 idea', p.A, [p.B, p.C, p.D, p.E, p.F]);
    await db.execute('UPDATE profiles SET active = 0 WHERE id = @id', { id: p.Gone });
    currentUser = admin;

    expect(await adminAddTeamMember(idea, p.G, { asLeader: false, override: false })).toMatchObject({
      error: expect.stringMatching(/at most 5/i),
    });
    expect(await adminAddTeamMember(idea, p.Gone, { asLeader: false, override: false })).toMatchObject({
      error: expect.stringMatching(/not an active/i),
    });
    expect(await adminAddTeamMember(idea, p.B, { asLeader: false, override: false })).toMatchObject({
      error: expect.stringMatching(/already on this team/i),
    });
    expect(await adminAddTeamMember(idea, p.G, { asLeader: true, override: false })).toMatchObject({
      error: expect.stringMatching(/already has a team leader/i),
    });
  });

  it('E12: non-admins cannot change submitted teams (server action and procedure)', async () => {
    const p = await people('A', 'B', 'C');
    const idea = await submit('E12 idea', p.A, [p.B]);
    as(p.A);
    expect(await adminRemoveTeamMember(idea, p.B, 'Trying it myself')).toEqual({ error: 'Not authorized' });
    expect(await adminAddTeamMember(idea, p.C, { asLeader: false, override: false })).toEqual({ error: 'Not authorized' });
    await expect(
      db.callProc('usp_admin_remove_team_member', { idea_id: idea, profile_id: p.B, reason: 'x', actor_id: p.A })
    ).rejects.toThrow(/only an admin/i);
  });

  it('E13: admin team changes are refused on drafts', async () => {
    const p = await people('A', 'B');
    as(p.A);
    const draft = await saveIdeaDraft(SEED.program, null, {
      idea_title: 'E13 draft',
      team_leader_id: p.A,
      team_members: [{ profile_id: p.B, member_order: 1 }],
    });
    const ideaId = (draft as { ideaId: string }).ideaId;
    currentUser = admin;
    expect(await adminRemoveTeamMember(ideaId, p.B, 'Left the company')).toMatchObject({
      error: expect.stringMatching(/only for submitted/i),
    });
  });

  it('E14: removing the last member leaves the idea with no members', async () => {
    const p = await people('A', 'B');
    const idea = await submit('E14 idea', p.A, [p.B]);
    currentUser = admin;
    expect(await adminRemoveTeamMember(idea, p.B, 'Moved to another business')).toEqual({ ok: true });
    expect(await team(idea)).toEqual({ leader: p.A, members: [] });
  });

  it('E16: publishing results for an idea with a vacant leader works and notifies the rest of the team', async () => {
    const p = await people('A', 'B');
    const idea = await submit('E16 idea', p.A, [p.B]);
    currentUser = admin;
    await adminRemoveTeamMember(idea, p.A, 'Resigned before screening');
    await screen([idea]);
    const note = await db.queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = @b AND type = 'idea_screening_passed'`,
      { b: p.B }
    );
    expect(note?.count).toBe(1);
  });
});
