import { NextResponse, type NextRequest } from 'next/server';
import { attempt, db, likeContains } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';

/**
 * Lightweight typeahead for adding team members to an idea. Auth required.
 * Any signed-in user may find any active colleague by name/email (a team
 * picker has to reach people who aren't teammates yet), but only the
 * minimum columns are returned and results are capped at 10.
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

  const { data, error } = await attempt(() =>
    db.query<{ id: string; full_name: string; email: string }>(
      `SELECT TOP (10) id, full_name, email
         FROM profiles
        WHERE active = 1
          AND (full_name LIKE @q OR email LIKE @q)
        ORDER BY full_name`,
      { q: likeContains(q) }
    )
  );

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ profiles: data ?? [] });
}
