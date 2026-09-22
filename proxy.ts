import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PARTICIPANT_PREFIXES = ['/overview', '/my-ideas', '/submit'];
const MENTOR_PREFIXES = ['/dashboard', '/reviews'];
const ADMIN_PREFIXES = [
  '/program',
  '/ideas',
  '/review-assignment',
  '/screening',
  '/qualifier',
  '/project-mentor',
  '/final-presentation',
  '/mentors',
  '/reports',
  '/audit',
  '/roles',
  '/settings',
  '/voting-management',
  '/showcase-content',
];
// Shared across roles, only requires *some* authenticated role:
const SHARED_PROTECTED_PREFIXES = ['/showcase', '/voting', '/results', '/notifications', '/profile'];

const PUBLIC_PREFIXES = ['/sign-in', '/auth/callback', '/access-denied', '/session-error'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // Refresh the session (required by @supabase/ssr in middleware).
  const { data } = await supabase.auth.getUser();
  const user = data?.user ?? null;

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  if (isPublic) {
    return response;
  }

  const needsAuth =
    PARTICIPANT_PREFIXES.some((p) => path.startsWith(p)) ||
    MENTOR_PREFIXES.some((p) => path.startsWith(p)) ||
    ADMIN_PREFIXES.some((p) => path.startsWith(p)) ||
    SHARED_PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  if (needsAuth && !user) {
    const redirectUrl = new URL('/sign-in', request.url);
    redirectUrl.searchParams.set('redirect_to', path);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (ADMIN_PREFIXES.some((p) => path.startsWith(p)))) {
    // Role check happens here at the edge for admin-only route groups; the
    // authoritative check still happens again server-side (layout/page) and
    // in RLS. We look up role via a lightweight query.
    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', user.id);
    const roleNames = (roleRows ?? []).map((r: any) => r.roles?.name);
    if (!roleNames.includes('admin')) {
      return NextResponse.redirect(new URL('/access-denied', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
