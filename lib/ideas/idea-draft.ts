import 'server-only';
import { db } from '@/lib/db';
import type { ImpactKind, ImpactType, SupportArea } from '@/types/database';

/** A saved draft mapped to the Submit New Idea form's state (NULLs become ''). */
export interface IdeaDraftInitial {
  ideaId: string;
  programId: string;
  basics: {
    team_name: string;
    idea_title: string;
    problem_opportunity: string;
    proposed_solution: string;
    target_users: string;
  };
  teamLeader: { profile_id: string; full_name: string } | null;
  teamMembers: { profile_id: string; full_name: string; member_order: number }[];
  impacts: { impact_kind: ImpactKind; impact_type: ImpactType | ''; explanation: string; measurable_result: string }[];
  supportRequests: { support_area: SupportArea; details: string; reason: string; estimate: string }[];
  mentorPrefs: { priority: 1 | 2; mentor_profile_id: string }[];
}

/**
 * Loads a draft for the Submit New Idea form. Same rule as writeDraft in
 * lib/services/ideas.ts: only the creator, and only while status='draft'.
 * Returns null otherwise (not found, someone else's, or already submitted).
 */
export async function fetchEditableDraft(ideaId: string, userId: string): Promise<IdeaDraftInitial | null> {
  const idea = await db.queryOne<{
    id: string;
    program_id: string;
    team_name: string | null;
    idea_title: string | null;
    problem_opportunity: string | null;
    proposed_solution: string | null;
    target_users: string | null;
    team_leader_id: string | null;
    leader_name: string | null;
  }>(
    `SELECT i.id, i.program_id, i.team_name, i.idea_title, i.problem_opportunity, i.proposed_solution,
            i.target_users, i.team_leader_id, p.full_name AS leader_name
       FROM ideas i
       LEFT JOIN profiles p ON p.id = i.team_leader_id
      WHERE i.id = @ideaId AND i.created_by = @uid AND i.status = 'draft'`,
    { ideaId, uid: userId }
  );
  if (!idea) return null;

  const [members, impacts, supportRequests, mentorPrefs] = await Promise.all([
    db.query<{ profile_id: string; full_name: string | null; member_order: number }>(
      `SELECT m.profile_id, p.full_name, m.member_order
         FROM idea_team_members m
         LEFT JOIN profiles p ON p.id = m.profile_id
        WHERE m.idea_id = @id
        ORDER BY m.member_order`,
      { id: ideaId }
    ),
    db.query<{ impact_kind: ImpactKind; impact_type: ImpactType; explanation: string | null; measurable_result: string | null }>(
      `SELECT impact_kind, impact_type, explanation, measurable_result
         FROM idea_impacts WHERE idea_id = @id
        ORDER BY CASE impact_kind WHEN 'primary' THEN 0 ELSE 1 END`,
      { id: ideaId }
    ),
    db.query<{ support_area: SupportArea; details: string | null; reason: string | null; estimate: string | null }>(
      `SELECT support_area, details, reason, estimate FROM idea_support_requests WHERE idea_id = @id`,
      { id: ideaId }
    ),
    db.query<{ priority: 1 | 2; mentor_profile_id: string }>(
      `SELECT priority, mentor_profile_id FROM idea_mentor_preferences WHERE idea_id = @id ORDER BY priority`,
      { id: ideaId }
    ),
  ]);

  const impactValues: IdeaDraftInitial['impacts'] = impacts.map((i) => ({
    impact_kind: i.impact_kind,
    impact_type: i.impact_type,
    explanation: i.explanation ?? '',
    measurable_result: i.measurable_result ?? '',
  }));
  // Impacts without a type are never stored, so the primary row may be missing.
  if (!impactValues.some((i) => i.impact_kind === 'primary')) {
    impactValues.unshift({ impact_kind: 'primary', impact_type: '', explanation: '', measurable_result: '' });
  }

  return {
    ideaId: idea.id,
    programId: idea.program_id,
    basics: {
      team_name: idea.team_name ?? '',
      idea_title: idea.idea_title ?? '',
      problem_opportunity: idea.problem_opportunity ?? '',
      proposed_solution: idea.proposed_solution ?? '',
      target_users: idea.target_users ?? '',
    },
    teamLeader: idea.team_leader_id
      ? { profile_id: idea.team_leader_id, full_name: idea.leader_name ?? 'Team leader' }
      : null,
    teamMembers: members.map((m) => ({
      profile_id: m.profile_id,
      full_name: m.full_name ?? 'Team member',
      member_order: m.member_order,
    })),
    impacts: impactValues,
    supportRequests: supportRequests.map((s) => ({
      support_area: s.support_area,
      details: s.details ?? '',
      reason: s.reason ?? '',
      estimate: s.estimate ?? '',
    })),
    mentorPrefs,
  };
}
