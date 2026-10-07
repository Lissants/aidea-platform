import { NextResponse, type NextRequest } from 'next/server';
import { attempt, db, likeContains } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lightweight typeahead for adding team members to an idea. Auth required.
 * Any signed-in user may find any active colleague by name/email (a team
 * picker has to reach people who aren't teammates yet), but only the
 * minimum columns are returned and results are capped at 10.
 *
 * With `programId`, each result also carries `committed_idea_title`: the
 * approved idea of that program the person is already on (they can't join
 * another team), or null.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const q = (request.nextUrl.searchParams.get('q')?.trim() ?? '').slice(0, 100);
  if (q.length < 2) {
    return NextResponse.json({ profiles: [] });
  }

  const programId = request.nextUrl.searchParams.get('programId');
  const validProgramId = programId && UUID_RE.test(programId) ? programId : null;

  const { data, error } = await attempt(() =>
    db.query<{ id: string; full_name: string; email: string; committed_idea_title: string | null }>(
      `SELECT TOP (10) pr.id, pr.full_name, pr.email, c.idea_title AS committed_idea_title
         FROM profiles pr
        OUTER APPLY (SELECT TOP (1) i.idea_title
                       FROM dbo.v_idea_participants p
                       JOIN dbo.v_approved_ideas a ON a.idea_id = p.idea_id
                       JOIN ideas i ON i.id = p.idea_id
                      WHERE p.profile_id = pr.id AND p.program_id = @programId) c
        WHERE pr.active = 1
          AND (pr.full_name LIKE @q OR pr.email LIKE @q)
        ORDER BY pr.full_name`,
      { q: likeContains(q), programId: validProgramId }
    )
  );

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ profiles: data ?? [] });
}
