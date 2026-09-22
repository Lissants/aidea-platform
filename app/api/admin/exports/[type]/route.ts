import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/permissions';
import { toCsv, csvResponse } from '@/lib/exports/csv';

const EXPORT_TYPES = [
  'submissions',
  'team-memberships',
  'business-impact',
  'support-requests',
  'review-assessments',
  'reviewer-assignments',
  'stage-results',
  'mentor-assignments',
  'voting-results',
  'audit-data',
] as const;
type ExportType = (typeof EXPORT_TYPES)[number];

/**
 * Admin-only CSV exports. Uses the caller's own session client (not the
 * service-role admin client) — RLS's admin_only / admins_full_access
 * policies are what actually gate every table this queries, so an export
 * never sees more than an admin session already could through the UI.
 * There is no participant/mentor export per spec — this route is
 * admin-only end to end.
 */
export async function GET(request: NextRequest, { params }: { params: { type: string } }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  if (!EXPORT_TYPES.includes(params.type as ExportType)) {
    return NextResponse.json({ error: 'Unknown export type' }, { status: 404 });
  }
  const type = params.type as ExportType;
  const supabase = createClient();

  switch (type) {
    case 'submissions': {
      const { data } = await supabase.from('ideas').select('*');
      const csv = toCsv(data ?? [], [
        { key: 'id', header: 'Idea ID' },
        { key: 'team_name', header: 'Team' },
        { key: 'idea_title', header: 'Title' },
        { key: 'status', header: 'Status' },
        { key: 'submitted_at', header: 'Submitted At' },
        { key: 'locked', header: 'Locked' },
        { key: 'created_by', header: 'Created By' },
        { key: 'created_at', header: 'Created At' },
      ]);
      return csvResponse(csv, 'submissions.csv');
    }

    case 'team-memberships': {
      const { data } = await supabase.from('idea_team_members').select('idea_id, member_order, profiles(full_name, email)');
      const rows = (data ?? []).map((r: any) => ({
        idea_id: r.idea_id,
        member_order: r.member_order,
        full_name: r.profiles?.full_name,
        email: r.profiles?.email,
      }));
      const csv = toCsv(rows, [
        { key: 'idea_id', header: 'Idea ID' },
        { key: 'member_order', header: 'Order' },
        { key: 'full_name', header: 'Full Name' },
        { key: 'email', header: 'Email' },
      ]);
      return csvResponse(csv, 'team-memberships.csv');
    }

    case 'business-impact': {
      const { data } = await supabase.from('idea_impacts').select('*');
      const csv = toCsv(data ?? [], [
        { key: 'idea_id', header: 'Idea ID' },
        { key: 'impact_kind', header: 'Kind' },
        { key: 'impact_type', header: 'Type' },
        { key: 'explanation', header: 'Explanation' },
        { key: 'measurable_result', header: 'Measurable Result' },
      ]);
      return csvResponse(csv, 'business-impact.csv');
    }

    case 'support-requests': {
      const { data } = await supabase.from('idea_support_requests').select('*');
      const csv = toCsv(data ?? [], [
        { key: 'idea_id', header: 'Idea ID' },
        { key: 'support_area', header: 'Area' },
        { key: 'details', header: 'Details' },
        { key: 'reason', header: 'Reason' },
        { key: 'estimate', header: 'Estimate' },
      ]);
      return csvResponse(csv, 'support-requests.csv');
    }

    case 'review-assessments': {
      const { data } = await supabase.from('reviews').select('*, profiles:reviewer_id(full_name)');
      const rows = (data ?? []).map((r: any) => ({ ...r, reviewer_name: r.profiles?.full_name }));
      const csv = toCsv(rows, [
        { key: 'idea_id', header: 'Idea ID' },
        { key: 'reviewer_name', header: 'Reviewer' },
        { key: 'desirability', header: 'Desirability' },
        { key: 'viability', header: 'Viability' },
        { key: 'realistic_implementation', header: 'Realistic Implementation' },
        { key: 'recommendation', header: 'Recommendation' },
        { key: 'comment', header: 'Comment' },
        { key: 'status', header: 'Status' },
        { key: 'submitted_at', header: 'Submitted At' },
        { key: 'reopen_reason', header: 'Reopen Reason' },
      ]);
      return csvResponse(csv, 'review-assessments.csv');
    }

    case 'reviewer-assignments': {
      const { data } = await supabase.from('review_assignments').select('*, mentor_profiles(profiles(full_name))');
      const rows = (data ?? []).map((r: any) => ({ ...r, mentor_name: r.mentor_profiles?.profiles?.full_name }));
      const csv = toCsv(rows, [
        { key: 'idea_id', header: 'Idea ID' },
        { key: 'mentor_name', header: 'Mentor' },
        { key: 'status', header: 'Status' },
        { key: 'assigned_at', header: 'Assigned At' },
      ]);
      return csvResponse(csv, 'reviewer-assignments.csv');
    }

    case 'stage-results': {
      const [{ data: screening }, { data: qualifier }, { data: finalPresentation }] = await Promise.all([
        supabase.from('screening_decisions').select('*'),
        supabase.from('qualifier_assessments').select('*'),
        supabase.from('final_presentation_assessments').select('*'),
      ]);
      const rows = [
        ...(screening ?? []).map((r: any) => ({ stage: 'screening', idea_id: r.idea_id, decision: r.decision, published: r.published })),
        ...(qualifier ?? []).map((r: any) => ({ stage: 'qualifier', idea_id: r.idea_id, decision: r.build_decision, published: r.published })),
        ...(finalPresentation ?? []).map((r: any) => ({
          stage: 'final_presentation',
          idea_id: r.idea_id,
          decision: r.winner_decision,
          published: r.published,
        })),
      ];
      const csv = toCsv(rows, [
        { key: 'stage', header: 'Stage' },
        { key: 'idea_id', header: 'Idea ID' },
        { key: 'decision', header: 'Decision' },
        { key: 'published', header: 'Published' },
      ]);
      return csvResponse(csv, 'stage-results.csv');
    }

    case 'mentor-assignments': {
      const { data } = await supabase.from('project_mentor_assignments').select('*, mentor_profiles(profiles(full_name))');
      const rows = (data ?? []).map((r: any) => ({ ...r, mentor_name: r.mentor_profiles?.profiles?.full_name }));
      const csv = toCsv(rows, [
        { key: 'idea_id', header: 'Idea ID' },
        { key: 'mentor_name', header: 'Project Mentor' },
        { key: 'published', header: 'Published' },
        { key: 'assigned_at', header: 'Assigned At' },
      ]);
      return csvResponse(csv, 'mentor-assignments.csv');
    }

    case 'voting-results': {
      const { data: periods } = await supabase.from('voting_periods').select('*');
      const rows: Record<string, unknown>[] = [];
      for (const period of periods ?? []) {
        const { data: tallies } = await supabase.rpc('fn_vote_tallies', { p_voting_period_id: period.id });
        for (const t of tallies ?? []) {
          rows.push({ voting_period_id: period.id, idea_id: t.idea_id, idea_title: t.idea_title, vote_count: t.vote_count });
        }
      }
      const csv = toCsv(rows, [
        { key: 'voting_period_id', header: 'Voting Period ID' },
        { key: 'idea_id', header: 'Idea ID' },
        { key: 'idea_title', header: 'Idea' },
        { key: 'vote_count', header: 'Votes' },
      ]);
      return csvResponse(csv, 'voting-results.csv');
    }

    case 'audit-data': {
      const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(5000);
      const csv = toCsv(data ?? [], [
        { key: 'id', header: 'ID' },
        { key: 'created_at', header: 'Timestamp' },
        { key: 'actor_id', header: 'Actor' },
        { key: 'entity_type', header: 'Entity Type' },
        { key: 'entity_id', header: 'Entity ID' },
        { key: 'action', header: 'Action' },
        { key: 'reason', header: 'Reason' },
        { key: 'prior_value', header: 'Prior Value' },
        { key: 'new_value', header: 'New Value' },
        { key: 'correlation_id', header: 'Correlation ID' },
        { key: 'program_id', header: 'Program ID' },
      ]);
      return csvResponse(csv, 'audit-data.csv');
    }

    default:
      return NextResponse.json({ error: 'Unknown export type' }, { status: 404 });
  }
}
