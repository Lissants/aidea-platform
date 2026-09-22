import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';

/** Lightweight typeahead for adding team members to an idea. Auth required. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) {
    return NextResponse.json({ profiles: [] });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
    .eq('active', true)
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profiles: data ?? [] });
}
