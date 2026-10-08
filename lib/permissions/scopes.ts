import 'server-only';

import { db } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { isAdmin, isMentor } from '@/lib/permissions';

/**
 * Row-level authorization for SQL Server.
 *
 * Supabase enforced these rules inside Postgres with RLS
 * (supabase/migrations/0099_rls.sql, 0013, 0014 — kept for reference, and
 * supabase/RLS_TEST_MATRIX.md is still the spec). SQL Server has no
 * per-request identity here (the app connects with one login), so every
 * service/page query must apply the equivalent filter itself. Use these
 * helpers rather than re-deriving the rules inline:
 *
 *   - `*Filter(user, alias)` return a SQL predicate + params to AND into a
 *     WHERE clause for list/detail reads. Param names are prefixed `scope_`
 *     so they won't collide with the caller's.
 *   - `can*` / `assert*` answer single-row questions for mutations.
 *
 * lib/permissions/index.ts `can()` stays the role-level (UX/nav) layer.
 */

export type Scope = { sql: string; params: Record<string, unknown> };

const ALLOW: Scope = { sql: '1 = 1', params: {} };

function assertAlias(alias: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`Invalid alias ${alias}`);
}

/**
 * ideas readable by `user` — mirrors participants_select_own_or_team,
 * mentors_select_submitted_ideas, admins_full_access_ideas and
 * anyone_select_showcased_ideas (now: voting candidates, v_vote_candidates).
 */
export function ideaReadFilter(user: SessionUser, alias = 'i'): Scope {
  assertAlias(alias);
  if (isAdmin(user.roles)) return ALLOW;
  const parts = [
    `${alias}.created_by = @scope_uid`,
    `dbo.fn_is_idea_team_member(${alias}.id, @scope_uid) = 1`,
    `EXISTS (SELECT 1 FROM dbo.v_vote_candidates scope_vc WHERE scope_vc.idea_id = ${alias}.id)`,
  ];
  if (isMentor(user.roles)) parts.push(`${alias}.status = 'submitted'`);
  return { sql: `(${parts.join(' OR ')})`, params: { scope_uid: user.id } };
}

/**
 * Child rows of an idea (impacts, support requests) — mirrors
 * idea_impacts_select / idea_support_requests_select: owner, or any
 * submitted idea, or admin. `ideaAlias` must be joined to `ideas`.
 */
export function ideaDetailReadFilter(user: SessionUser, ideaAlias = 'i'): Scope {
  assertAlias(ideaAlias);
  if (isAdmin(user.roles)) return ALLOW;
  return {
    sql: `(${ideaAlias}.created_by = @scope_uid OR ${ideaAlias}.status = 'submitted' OR dbo.fn_is_idea_team_member(${ideaAlias}.id, @scope_uid) = 1)`,
    params: { scope_uid: user.id },
  };
}

/** review_assignments readable by `user` — mirrors review_assignments_mentor_select. */
export function reviewAssignmentReadFilter(user: SessionUser, alias = 'ra'): Scope {
  assertAlias(alias);
  if (isAdmin(user.roles)) return ALLOW;
  return {
    sql: `EXISTS (SELECT 1 FROM mentor_profiles scope_mp WHERE scope_mp.id = ${alias}.mentor_profile_id AND scope_mp.profile_id = @scope_uid)`,
    params: { scope_uid: user.id },
  };
}

/** reviews readable by `user` — mirrors mentors_select_own_reviews. */
export function reviewReadFilter(user: SessionUser, alias = 'r'): Scope {
  assertAlias(alias);
  if (isAdmin(user.roles)) return ALLOW;
  return { sql: `${alias}.reviewer_id = @scope_uid`, params: { scope_uid: user.id } };
}

/**
 * profiles readable by `user` — self, admin, teammates, and team members
 * of voting candidates — v_vote_candidates (profiles_select_self_or_admin,
 * profiles_select_teammates, anyone_select_showcased_team_profiles).
 *
 * Two additions over the Supabase-era policies, which left the mentor
 * preference picker showing "Mentor" and the review page showing "Unknown":
 * mentors' own profiles are readable by every signed-in user (mentor
 * directory / picker), and mentors can read the leader and members of any
 * submitted idea (the ideas they can already see).
 */
export function profileReadFilter(user: SessionUser, alias = 'p'): Scope {
  assertAlias(alias);
  if (isAdmin(user.roles)) return ALLOW;
  const mentorClause = isMentor(user.roles)
    ? `
      OR EXISTS (SELECT 1 FROM ideas scope_mi WHERE scope_mi.status = 'submitted' AND scope_mi.team_leader_id = ${alias}.id)
      OR EXISTS (SELECT 1 FROM idea_team_members scope_mt JOIN ideas scope_mi2 ON scope_mi2.id = scope_mt.idea_id AND scope_mi2.status = 'submitted'
                 WHERE scope_mt.profile_id = ${alias}.id)`
    : '';
  return {
    sql: `(${alias}.id = @scope_uid
      OR EXISTS (SELECT 1 FROM mentor_profiles scope_m WHERE scope_m.profile_id = ${alias}.id)${mentorClause}
      OR EXISTS (SELECT 1 FROM idea_team_members scope_a JOIN idea_team_members scope_b ON scope_a.idea_id = scope_b.idea_id
                 WHERE scope_a.profile_id = @scope_uid AND scope_b.profile_id = ${alias}.id)
      OR EXISTS (SELECT 1 FROM ideas scope_i JOIN dbo.v_vote_candidates scope_vc ON scope_vc.idea_id = scope_i.id
                 WHERE scope_i.team_leader_id = ${alias}.id)
      OR EXISTS (SELECT 1 FROM idea_team_members scope_t JOIN dbo.v_vote_candidates scope_vc2 ON scope_vc2.idea_id = scope_t.idea_id
                 WHERE scope_t.profile_id = ${alias}.id))`,
    params: { scope_uid: user.id },
  };
}

/** Joins a Scope's SQL into a WHERE clause alongside other conditions. */
export function where(...conditions: (string | Scope | null | undefined | false)[]): Scope {
  const sql: string[] = [];
  const params: Record<string, unknown> = {};
  for (const c of conditions) {
    if (!c) continue;
    if (typeof c === 'string') sql.push(c);
    else {
      sql.push(c.sql);
      Object.assign(params, c.params);
    }
  }
  return { sql: sql.length ? sql.join(' AND ') : '1 = 1', params };
}

// ---------------------------------------------------------------------------
// Single-row checks
// ---------------------------------------------------------------------------

export async function canReadIdea(user: SessionUser, ideaId: string) {
  const scope = ideaReadFilter(user, 'i');
  const row = await db.queryOne(`SELECT 1 AS ok FROM ideas i WHERE i.id = @ideaId AND ${scope.sql}`, {
    ideaId,
    ...scope.params,
  });
  return row !== null;
}

/** participants_crud_own_drafts: creator while status = 'draft' (admins always). */
export async function canEditIdeaDraft(user: SessionUser, ideaId: string) {
  if (isAdmin(user.roles)) return true;
  const row = await db.queryOne(
    `SELECT 1 AS ok FROM ideas WHERE id = @ideaId AND created_by = @uid AND status = 'draft'`,
    { ideaId, uid: user.id }
  );
  return row !== null;
}

/** The mentor_profiles.id for this user, or null if they aren't a mentor. */
export async function mentorProfileIdFor(userId: string) {
  const row = await db.queryOne<{ id: string }>('SELECT id FROM mentor_profiles WHERE profile_id = @userId', { userId });
  return row?.id ?? null;
}

/** True when the review assignment belongs to this user's mentor profile (or user is admin). */
export async function isAssignedMentor(user: SessionUser, reviewAssignmentId: string) {
  if (isAdmin(user.roles)) return true;
  const row = await db.queryOne(
    `SELECT 1 AS ok FROM review_assignments ra JOIN mentor_profiles mp ON mp.id = ra.mentor_profile_id
      WHERE ra.id = @reviewAssignmentId AND mp.profile_id = @uid`,
    { reviewAssignmentId, uid: user.id }
  );
  return row !== null;
}
