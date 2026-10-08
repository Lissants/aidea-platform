'use server';

import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { endSession, startSession } from '@/lib/auth/session';
import { isAllowedEmail } from '@/lib/auth/email-domain';
import { appOrigin, isMicrosoftSsoEnabled, isPasswordSignInEnabled, microsoftLogoutUrl } from '@/lib/auth/microsoft';

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

// Simple in-memory throttle: max attempts per email per window. Good enough
// for a single Node process; put a shared store in front if this ever runs
// as multiple replicas.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; first: number }>();

function throttled(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

// Compared against when the email is unknown, so response time doesn't
// reveal which accounts exist.
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync(crypto.randomUUID(), 10));

const INVALID = 'Invalid email or password' as const;

/** Email + password sign-in against users.password_hash (bcrypt). */
export async function signInWithPassword(input: { email: string; password: string }) {
  if (!isPasswordSignInEnabled()) return { error: 'Please sign in with Microsoft.' } as const;
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { error: INVALID } as const;
  const { email, password } = parsed.data;

  if (throttled(email)) {
    return { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' } as const;
  }
  if (!isAllowedEmail(email)) return { error: INVALID } as const;

  const account = await db.queryOne<{ id: string; email: string; password_hash: string | null; active: boolean | null }>(
    `SELECT u.id, u.email, u.password_hash, p.active
       FROM users u LEFT JOIN profiles p ON p.id = u.id
      WHERE u.email = @email`,
    { email }
  );

  const ok = await bcrypt.compare(password, account?.password_hash ?? getDummyHash());
  if (!account || !account.password_hash || !ok) return { error: INVALID } as const;
  if (account.active === false) return { error: 'This account has been deactivated.' } as const;

  attempts.delete(email);
  await startSession(account.id, account.email, 'pwd');
  return { ok: true } as const;
}

/** Ends the AIdea session; Microsoft sessions are also signed out of Entra. */
export async function signOut() {
  const method = await endSession();
  if (method === 'sso' && isMicrosoftSsoEnabled()) {
    const h = await headers();
    const requestUrl = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? 'localhost'}`;
    redirect(microsoftLogoutUrl(appOrigin(requestUrl)));
  }
  redirect('/sign-in');
}
