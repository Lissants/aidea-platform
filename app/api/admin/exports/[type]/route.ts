import { NextResponse, type NextRequest } from 'next/server';
import { attempt, db } from '@/lib/db';
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
 * Admin-only CSV exports. The database no longer enforces per-user access
 * (the app connects with a single login), so the isAdmin check below is
 * the only gate: every query here reads whole tables and must never run
 * for a non-admin session. There is no participant/mentor export per
 * spec — this route is admin-only end to end.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ type: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  if (!EXPORT_TYPES.includes(params.type as ExportType)) {
    return NextResponse.json({ error: 'Unknown export type' }, { status: 404 });
  }
  const type = params.type as ExportType;

  switch (type) {
    case 'submissions': {
      const data = await db.query('SELECT * FROM ideas');
      const csv = toCsv(data, [
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
      const rows = await db.query<{ idea_id: string; member_order: number; full_name: string | null; email: string | null }>(
        `SELECT itm.idea_id, itm.member_order, p.full_name, p.email
           FROM idea_team_members itm
           LEFT JOIN profiles p ON p.id = itm.profile_id`
      );
      const csv = toCsv(rows, [
        { key: 'idea_id', header: 'Idea ID' },
        { key: 'member_order', header: 'Order' },
        { key: 'full_name', header: 'Full Name' },
        { key: 'email', header: 'Email' },
      ]);
      return csvResponse(csv, 'team-memberships.csv');
    }

    case 'business-impact': {
      const data = await db.query('SELECT * FROM idea_impacts');
      const csv = toCsv(data, [
        { key: 'idea_id', header: 'Idea ID' },
        { key: 'impact_kind', header: 'Kind' },
        { key: 'impact_type', header: 'Type' },
        { key: 'explanation', header: 'Explanation' },
        { key: 'measurable_result', header: 'Measurable Result' },
      ]);
      return csvResponse(csv, 'business-impact.csv');
    }

    case 'support-requests': {
      const data = await db.query('SELECT * FROM idea_support_requests');
      const csv = toCsv(data, [
        { key: 'idea_id', header: 'Idea ID' },
        { key: 'support_area', header: 'Area' },
        { key: 'details', header: 'Details' },
        { key: 'reason', header: 'Reason' },
        { key: 'estimate', header: 'Estimate' },
      ]);
      return csvResponse(csv, 'support-requests.csv');
    }

    case 'review-assessments': {
      const rows = await db.query(
        `SELECT r.*, p.full_name AS reviewer_name
           FROM reviews r
           LEFT JOIN profiles p ON p.id = r.reviewer_id`
      );
      const csv = toCsv(rows, [
        { key: 'idea_id', header: 'Idea ID' },
        { key: 'reviewer_name', header: 'Reviewer' },
        { key: 'desirability', header: 'Desirability' },
        { key: 'viability', header: 'Viability' },
        { key: 'business_impact', header: 'Business Impact' },
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
      const rows = await db.query(
        `SELECT ra.*, p.full_name AS mentor_name
           FROM review_assignments ra
           LEFT JOIN mentor_profiles mp ON mp.id = ra.mentor_profile_id
           LEFT JOIN profiles p ON p.id = mp.profile_id`
      );
      const csv = toCsv(rows, [
        { key: 'idea_id', header: 'Idea ID' },
        { key: 'mentor_name', header: 'Mentor' },
        { key: 'status', header: 'Status' },
        { key: 'assigned_at', header: 'Assigned At' },
      ]);
      return csvResponse(csv, 'reviewer-assignments.csv');
    }

    case 'stage-results': {
      const [screening, qualifier, finalPresentation] = await Promise.all([
        db.query<{ idea_id: string; decision: string; published: boolean }>('SELECT * FROM screening_decisions'),
        db.query<{ idea_id: string; build_decision: string | null; published: boolean }>('SELECT * FROM qualifier_assessments'),
        db.query<{ idea_id: string; winner_decision: string | null; published: boolean }>(
          'SELECT * FROM final_presentation_assessments'
        ),
      ]);
      const rows = [
        ...screening.map((r) => ({ stage: 'screening', idea_id: r.idea_id, decision: r.decision, published: r.published })),
        ...qualifier.map((r) => ({ stage: 'qualifier', idea_id: r.idea_id, decision: r.build_decision, published: r.published })),
        ...finalPresentation.map((r) => ({
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
      const rows = await db.query(
        `SELECT pma.*, p.full_name AS mentor_name
           FROM project_mentor_assignments pma
           LEFT JOIN mentor_profiles mp ON mp.id = pma.mentor_profile_id
           LEFT JOIN profiles p ON p.id = mp.profile_id`
      );
      const csv = toCsv(rows, [
        { key: 'idea_id', header: 'Idea ID' },
        { key: 'mentor_name', header: 'Project Mentor' },
        { key: 'published', header: 'Published' },
        { key: 'assigned_at', header: 'Assigned At' },
      ]);
      return csvResponse(csv, 'mentor-assignments.csv');
    }

    case 'voting-results': {
      const periods = await db.query<{ id: string }>('SELECT * FROM voting_periods');
      const rows: Record<string, unknown>[] = [];
      for (const period of periods) {
        // Aggregate counts only; admins get live tallies even before publishing.
        const { data: tallies } = await attempt(() =>
          db.callProc<{ idea_id: string; idea_title: string; vote_count: number }>('usp_vote_tallies', {
            voting_period_id: period.id,
            actor_id: user.id,
          })
        );
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
      const data = await db.query('SELECT TOP (5000) * FROM audit_logs ORDER BY created_at DESC');
      const csv = toCsv(data, [
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
