'use server';

import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { endSession, startSession } from '@/lib/auth/session';
import { isAllowedEmail } from '@/lib/auth/email-domain';
import { authenticateWithAd, isAdEnabled, localPasswordsAllowed } from '@/lib/auth/ldap';
import { appOrigin, isMicrosoftSsoEnabled, isPasswordSignInEnabled, microsoftLogoutUrl } from '@/lib/auth/microsoft';
import { findOrCreateDirectoryUser } from '@/lib/auth/provision';

// With AD sign-in the login may be a network ID (jdoe, CORP\jdoe), not an email.
const signInSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(320),
  password: z.string().min(1).max(200),
});
const emailSchema = z.string().email();

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

const DEACTIVATED = 'This account has been deactivated.' as const;

const AD_MESSAGES = {
  locked: 'Your Windows account is locked. Contact Godrej IT to unlock it.',
  password_expired: 'Your Windows password has expired. Change it on a company PC, then sign in again.',
  unavailable: 'Sign-in is temporarily unavailable. Please try again in a few minutes.',
} as const;

/**
 * Sign-in with a Godrej Windows account: the login (email or network ID) and
 * password are checked against Active Directory over LDAPS (lib/auth/ldap.ts),
 * the only way in for a production build. Under `npm run dev` and the test
 * runner, a login AD refuses or can't check falls back to a local AIdea
 * password, so the seeded demo accounts (not in AD) keep working.
 */
export async function signInWithPassword(input: { email: string; password: string }) {
  if (!isPasswordSignInEnabled()) return { error: 'Please sign in with Microsoft.' } as const;
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { error: INVALID } as const;
  const { email: login, password } = parsed.data;

  // Also keeps AIdea from tripping the AD lockout policy on someone's account.
  if (throttled(login)) {
    return { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' } as const;
  }

  if (!isAdEnabled()) {
    if (localPasswordsAllowed()) return signInWithLocalPassword(login, password);
    console.error('[auth] Sign-in refused: Active Directory is not configured (set LDAP_URL to ldaps:// domain controllers).');
    return { error: 'Sign-in is not configured. Contact the AIdea team.' } as const;
  }

  const result = await authenticateWithAd(login, password);
  if (result.ok) {
    if (!isAllowedEmail(result.user.email)) return { error: INVALID } as const;
    const account = await findOrCreateDirectoryUser({
      idColumn: 'ad_object_guid',
      id: result.user.guid,
      email: result.user.email,
      name: result.user.name,
      department: result.user.department,
      title: result.user.title,
    });
    if (!account) return { error: DEACTIVATED } as const;
    attempts.delete(login);
    await startSession(account.id, account.email, 'ldap');
    return { ok: true } as const;
  }

  if (localPasswordsAllowed() && (result.reason === 'invalid' || result.reason === 'not_found' || result.reason === 'unavailable')) {
    const local = await signInWithLocalPassword(login, password);
    if ('ok' in local || result.reason !== 'unavailable') return local;
  }
  // AD answers "no such user" and "wrong password" alike, and with a service
  // account a disabled account is found before its password is checked, so
  // naming either would reveal which accounts exist.
  if (result.reason === 'invalid' || result.reason === 'not_found' || result.reason === 'disabled') {
    return { error: INVALID } as const;
  }
  return { error: AD_MESSAGES[result.reason] } as const;
}

async function signInWithLocalPassword(email: string, password: string) {
  if (!localPasswordsAllowed()) return { error: INVALID } as const;
  if (!emailSchema.safeParse(email).success || !isAllowedEmail(email)) return { error: INVALID } as const;

  const account = await db.queryOne<{ id: string; email: string; password_hash: string | null; active: boolean | null }>(
    `SELECT u.id, u.email, u.password_hash, p.active
       FROM users u LEFT JOIN profiles p ON p.id = u.id
      WHERE u.email = @email`,
    { email }
  );

  const ok = await bcrypt.compare(password, account?.password_hash ?? getDummyHash());
  if (!account || !account.password_hash || !ok) return { error: INVALID } as const;
  if (account.active === false) return { error: DEACTIVATED } as const;

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
