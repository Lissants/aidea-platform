import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { ACTIVE_ROLE_COOKIE, getCurrentUser } from '@/lib/auth/session';
import type { AppRole } from '@/lib/constants/navigation';

const VALID_ROLES: AppRole[] = ['admin', 'mentor', 'participant', 'employee_voter'];

/**
 * Persists the user's "acting as" role choice in a cookie. The role must be
 * one the user actually holds (checked server-side against user_roles) —
 * this never grants a role, it only picks which of the user's existing
 * roles the AppShell renders for.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const role = body?.role as AppRole | undefined;

  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!user.roles.includes(role)) {
    return NextResponse.json({ error: 'Role not held by this user' }, { status: 403 });
  }

  cookies().set(ACTIVE_ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ ok: true });
}
