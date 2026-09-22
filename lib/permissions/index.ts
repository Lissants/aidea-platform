import type { AppRole } from '@/lib/constants/navigation';

/**
 * Permissions matrix. This module MUST mirror the RLS policies in
 * supabase/migrations/0099_rls.sql — every `can()` check here has a matching
 * policy there (see inline comments below linking to policy names). This is
 * a defense-in-depth / UX layer (hide nav items, gate pages, gate server
 * actions before even hitting the DB) — the database is the real
 * authorization boundary and must never be trusted to be redundant with
 * this file. Never rely on this module alone to protect a mutation.
 */

export type Action =
  | 'idea:create'
  | 'idea:edit_draft'
  | 'idea:submit'
  | 'idea:view_own'
  | 'idea:view_all'
  | 'review:create_own'
  | 'review:edit_own_draft'
  | 'review:view_all'
  | 'screening:decide'
  | 'screening:view_internal'
  | 'qualifier:decide'
  | 'project_mentor:assign'
  | 'final_presentation:decide'
  | 'showcase:manage'
  | 'showcase:view_published'
  | 'voting:cast'
  | 'voting:manage'
  | 'reports:view'
  | 'audit:view'
  | 'settings:manage';

export interface PermissionContext {
  isOwner?: boolean;
  isTeamMember?: boolean;
  isAssignedMentor?: boolean;
  entityPublished?: boolean;
}

/**
 * `can(action, role, context)` — role-based checks with optional row-level
 * context flags. Each case comments the mirrored RLS policy name.
 */
export function can(action: Action, role: AppRole, context: PermissionContext = {}): boolean {
  switch (action) {
    case 'idea:create':
    case 'idea:edit_draft':
      // Mirrors RLS: "participants_crud_own_drafts" on public.ideas
      return role === 'participant' && (context.isOwner ?? true);
    case 'idea:submit':
      // Mirrors RLS: "participants_crud_own_drafts" (update path, status transition
      // draft -> submitted enforced by fn_submit_idea, not by RLS alone)
      return role === 'participant' && (context.isOwner ?? true);
    case 'idea:view_own':
      // Mirrors RLS: "participants_select_own_or_team" via ideas_participant_view
      return (
        role === 'participant' && ((context.isOwner ?? true) || (context.isTeamMember ?? false))
      );
    case 'idea:view_all':
      // Mirrors RLS: "mentors_select_submitted_ideas", "admins_full_access"
      return role === 'mentor' || role === 'admin';
    case 'review:create_own':
    case 'review:edit_own_draft':
      // Mirrors RLS: "mentors_modify_own_nonsubmitted_reviews"
      return role === 'mentor' && (context.isAssignedMentor ?? true);
    case 'review:view_all':
      // Mirrors RLS: "admins_full_access" on public.reviews
      return role === 'admin';
    case 'screening:decide':
    case 'screening:view_internal':
      return role === 'admin';
    case 'qualifier:decide':
      return role === 'admin';
    case 'project_mentor:assign':
      return role === 'admin';
    case 'final_presentation:decide':
      return role === 'admin';
    case 'showcase:manage':
      return role === 'admin';
    case 'showcase:view_published':
      // Mirrors RLS: "anyone_select_published_showcase_projects"
      return context.entityPublished ?? true;
    case 'voting:cast':
      // Mirrors RLS: "voters_insert_single_vote" + fn_submit_vote guard
      return role === 'employee_voter' || role === 'participant' || role === 'mentor' || role === 'admin';
    case 'voting:manage':
      return role === 'admin';
    case 'reports:view':
    case 'audit:view':
    case 'settings:manage':
      // Mirrors RLS: "admins_only_read" on public.audit_logs
      return role === 'admin';
    default:
      return false;
  }
}

export const isAdmin = (roles: AppRole[]) => roles.includes('admin');
export const isMentor = (roles: AppRole[]) => roles.includes('mentor');
export const isParticipant = (roles: AppRole[]) => roles.includes('participant');
export const isEmployeeVoter = (roles: AppRole[]) => roles.includes('employee_voter');
export const hasAnyRole = (roles: AppRole[], required: AppRole[]) =>
  required.some((r) => roles.includes(r));
