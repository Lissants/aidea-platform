import { createClient } from '@/lib/supabase/server';
import type { StatusKey } from '@/lib/constants/status';
import type { ImpactType } from '@/types/database';

export interface DashboardIdeaRow {
  id: string;
  idea_title: string;
  team_name: string;
  submitted_at: string | null;
  impact_types: ImpactType[];
  workflow_status: StatusKey;
  assignment_status: string | null;
  reviewer_name: string | null;
}

interface DashboardFilters {
  search?: string;
  impactType?: ImpactType | 'all';
  status?: StatusKey | 'all';
  page?: number;
  pageSize?: number;
}

/**
 * Idea Dashboard read model for mentors: every submitted idea, with a
 * derived workflow status. Screening/qualifier fields are intentionally
 * NOT surfaced here beyond "awaiting publication" vs "published" — even
 * though RLS lets mentors select the underlying screening_decisions /
 * qualifier_assessments rows (for downstream program context), the product
 * rule is that mentors only see the actual decision once it's published.
 */
export async function fetchMentorDashboard(programId: string, filters: DashboardFilters = {}) {
  const supabase = createClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;

  let query = supabase
    .from('ideas')
    .select(
      `id, idea_title, team_name, submitted_at,
       idea_impacts (impact_type),
       review_assignments (status),
       reviews (status),
       screening_decisions (published),
       qualifier_assessments (published)`
    )
    .eq('program_id', programId)
    .eq('status', 'submitted');

  if (filters.search) {
    query = query.or(`idea_title.ilike.%${filters.search}%,team_name.ilike.%${filters.search}%`);
  }

  const { data, error } = await query.order('submitted_at', { ascending: false });
  if (error || !data) return { rows: [], total: 0 };

  let rows: DashboardIdeaRow[] = (data as any[]).map((idea) => {
    const impactTypes: ImpactType[] = (idea.idea_impacts ?? []).map((i: any) => i.impact_type);
    const assignment = idea.review_assignments?.[0] ?? idea.review_assignments ?? null;
    const review = idea.reviews?.[0] ?? idea.reviews ?? null;
    const screening = idea.screening_decisions?.[0] ?? idea.screening_decisions ?? null;
    const qualifier = idea.qualifier_assessments?.[0] ?? idea.qualifier_assessments ?? null;

    let workflow_status: StatusKey = 'waiting_assignment';
    const assignmentStatus: string | null = assignment?.status ?? null;

    if (assignmentStatus === 'routing_required') {
      workflow_status = 'routing_required';
    } else if (!assignment) {
      workflow_status = 'waiting_assignment';
    } else if (!review || review.status !== 'submitted') {
      workflow_status = 'waiting_for_review';
    } else if (qualifier) {
      workflow_status = qualifier.published ? 'published' : 'awaiting_publication';
    } else if (screening) {
      workflow_status = screening.published ? 'published' : 'awaiting_publication';
    } else {
      workflow_status = 'review_completed';
    }

    return {
      id: idea.id,
      idea_title: idea.idea_title,
      team_name: idea.team_name,
      submitted_at: idea.submitted_at,
      impact_types: impactTypes,
      workflow_status,
      assignment_status: assignmentStatus,
      reviewer_name: null,
    };
  });

  if (filters.impactType && filters.impactType !== 'all') {
    rows = rows.filter((r) => r.impact_types.includes(filters.impactType as ImpactType));
  }
  if (filters.status && filters.status !== 'all') {
    rows = rows.filter((r) => r.workflow_status === filters.status);
  }

  const total = rows.length;
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  return { rows: paged, total };
}
