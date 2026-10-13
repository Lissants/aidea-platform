'use server';

import { db } from '@/lib/db';
import { adTestEnabled, adTestSettings, checkConnection, describeConnectionError, verifyUser, type Step } from '@/lib/auth/ad-test';
import { allowedDomains, isAllowedEmail } from '@/lib/auth/email-domain';
import { findOrCreateDirectoryUser } from '@/lib/auth/provision';
import { DEFAULT_TIER, assignedTier } from '@/lib/auth/roles';
import { TIER_LABELS } from '@/lib/constants/navigation';
import { startSession } from '@/lib/auth/session';

export type AdTestResult = { steps: Step[]; signedIn?: { name: string; email: string } };

const LABELS = [
  'Reach the domain controller',
  'Check your Windows password',
  'Read your AD record',
  'Email allowed in AIdea',
  'Sign in to AIdea',
] as const;

const REASONS = {
  invalid: 'AD rejected the network ID or password.',
  locked: 'Your AD account is locked out.',
  password_expired: 'Your Windows password has expired. Change it, then try again.',
  disabled: 'Your AD account is disabled.',
  not_found: 'AD has no single account with an email address for this login.',
  unavailable: 'No domain controller answered the sign-in.',
  throttled: "Stopped after 3 password checks in 15 minutes so AD doesn't lock your account. Wait, then try again.",
} as const;

/** Completed steps, then the failure, then every remaining step marked skipped. */
function stopAt(done: Step[], failed: Step): AdTestResult {
  const rest = LABELS.slice(done.length + 1).map((label) => ({ label, status: 'skipped' as const, detail: 'Not run.' }));
  return { steps: [...done, failed, ...rest] };
}

function disabledResult(): AdTestResult {
  return { steps: [{ label: LABELS[0], status: 'fail', detail: 'The AD test page only runs under npm run dev.' }] };
}

/** Step 1 only: connection, TLS and directory info. No password needed. */
export async function checkAdConnection(): Promise<AdTestResult> {
  if (!adTestEnabled()) return disabledResult();
  const { url } = adTestSettings();
  if (!url) return stopAt([], { label: LABELS[0], status: 'fail', detail: 'No server: set LDAP_URL, or run this on a domain-joined PC.' });
  const { step } = await checkConnection(url);
  return { steps: [step] };
}

/**
 * The whole AD sign-in, step by step, ending in a real AIdea session exactly
 * like signInWithPassword (lib/auth/actions.ts): AD check on one server,
 * email-domain gate, then findOrCreateDirectoryUser, then startSession(…, 'ldap').
 */
export async function testAdSignIn(input: { login: string; password: string }): Promise<AdTestResult> {
  if (!adTestEnabled()) return disabledResult();
  const login = String(input?.login ?? '').trim();
  const password = String(input?.password ?? '');
  const steps: Step[] = [];

  const { url } = adTestSettings();
  if (!url) return stopAt([], { label: LABELS[0], status: 'fail', detail: 'No server: set LDAP_URL, or run this on a domain-joined PC.' });
  const connection = await checkConnection(url);
  if (connection.step.status === 'fail') return stopAt([], connection.step);
  if (!connection.baseDn) {
    return stopAt([], { ...connection.step, status: 'fail', detail: 'Connected, but AD returned no base DN. Set LDAP_BASE_DN.' });
  }
  steps.push(connection.step);

  let verified;
  try {
    verified = await verifyUser(url, login, password);
  } catch (err) {
    return stopAt(steps, { label: LABELS[1], status: 'fail', detail: describeConnectionError(err) });
  }
  const { result, passwordChecked } = verified;
  if (!result.ok) {
    if (!passwordChecked) return stopAt(steps, { label: LABELS[1], status: 'fail', detail: REASONS[result.reason] });
    steps.push({ label: LABELS[1], status: 'ok', detail: 'AD accepted the password.' });
    return stopAt(steps, { label: LABELS[2], status: 'fail', detail: REASONS[result.reason] });
  }
  const { user } = result;
  steps.push({ label: LABELS[1], status: 'ok', detail: 'AD accepted the password.' });
  steps.push({
    label: LABELS[2],
    status: 'ok',
    detail: [
      user.name || '(no display name)',
      user.email,
      user.title ?? '(no title)',
      user.department ?? '(no department)',
      `objectGUID ${user.guid}`,
    ].join(' · '),
  });

  if (!isAllowedEmail(user.email)) {
    return stopAt(steps, { label: LABELS[3], status: 'fail', detail: `${user.email} is outside ALLOWED_EMAIL_DOMAIN (${allowedDomains().join(', ')}).` });
  }
  steps.push({
    label: LABELS[3],
    status: 'ok',
    detail: allowedDomains().length ? 'The domain is in ALLOWED_EMAIL_DOMAIN.' : 'ALLOWED_EMAIL_DOMAIN is not set, so any domain is allowed.',
  });

  try {
    const existing = await db.queryOne<{ id: string }>('SELECT id FROM users WHERE ad_object_guid = @guid OR email = @email', {
      guid: user.guid,
      email: user.email,
    });
    const account = await findOrCreateDirectoryUser({
      idColumn: 'ad_object_guid',
      id: user.guid,
      email: user.email,
      name: user.name,
      department: user.department,
      title: user.title,
    });
    if (!account) return stopAt(steps, { label: LABELS[4], status: 'fail', detail: 'Your AIdea profile is deactivated.' });
    await startSession(account.id, account.email, 'ldap');
    steps.push({
      label: LABELS[4],
      status: 'ok',
      detail: existing
        ? `Signed in to your existing AIdea account (${account.email}).`
        : `Created your AIdea account as ${TIER_LABELS[assignedTier(user.email) ?? DEFAULT_TIER]} and signed in.`,
    });
  } catch (err) {
    return stopAt(steps, { label: LABELS[4], status: 'fail', detail: `Database error: ${err instanceof Error ? err.message : String(err)}` });
  }

  return { steps, signedIn: { name: user.name, email: user.email } };
}
