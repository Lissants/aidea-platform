import 'server-only';

import fs from 'node:fs';
import { Client, Filter, InvalidCredentialsError, type ClientOptions, type Entry } from 'ldapts';

/**
 * Sign-in against on-premises Active Directory over LDAPS, the only way into
 * AIdea in production. Enabled when there is a domain controller to ask:
 * LDAP_URL, or (outside production only) the one this PC signed in through.
 * In production LDAP_URL must use ldaps:// so passwords never cross the
 * network in clear text.
 *
 * Two ways to check a login, chosen by whether IT's service account is set:
 * - LDAP_BIND_DN + LDAP_BIND_PASSWORD: bind as the read-only service account,
 *   find exactly one user whose mail / userPrincipalName / sAMAccountName
 *   matches, then bind as that user's DN with the typed password.
 * - otherwise: bind as the user directly (email/UPN or DOMAIN\id as typed, a
 *   bare network ID with LDAP_DOMAIN), then read their own record over that
 *   connection. AD answers "no such user" and "wrong password" the same way.
 *
 * The base DN is LDAP_BASE_DN, else the domain's defaultNamingContext from the
 * RootDSE. The password is held in memory only for the bind and is never
 * stored or logged.
 *
 * IT setup: the domain controllers' LDAPS certificate issued by the corporate
 * CA, that CA's root certificate (PEM) at LDAP_CA_CERT_PATH, and optionally a
 * service account with read access to the user OU.
 */

export type AdUser = { guid: string; email: string; name: string; department: string | null; title: string | null };
export type AdFailure = 'not_found' | 'invalid' | 'disabled' | 'locked' | 'password_expired' | 'unavailable';
export type AdResult = { ok: true; user: AdUser } | { ok: false; reason: AdFailure };
/** One server's answer; `passwordChecked` means AD accepted the password before the record check failed. */
export type AdAttempt = { result: AdResult; passwordChecked: boolean };

const ACCOUNTDISABLE = 0x2;
const DEFAULT_LOGIN_ATTRIBUTES = ['mail', 'userPrincipalName', 'sAMAccountName'];

let warnedInsecureUrl = false;

function configuredUrls() {
  return (process.env.LDAP_URL ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
}

/** ldaps:// URL of the domain controller this PC signed in through (domain-joined dev PCs). */
export function machineServerUrl() {
  const domain = process.env.USERDNSDOMAIN?.toLowerCase();
  if (!domain) return null;
  const dc = process.env.LOGONSERVER?.replace(/^\\+/, '').toLowerCase();
  return `ldaps://${dc ? `${dc}.${domain}` : domain}:636`;
}

/** Servers to try in order: LDAP_URL, else (outside production) this PC's domain controller. */
export function ldapUrls() {
  const urls = configuredUrls();
  if (urls.length || process.env.NODE_ENV === 'production') return urls;
  const machine = machineServerUrl();
  return machine ? [machine] : [];
}

export function isAdEnabled() {
  const urls = ldapUrls();
  if (!urls.length) return false;
  if (process.env.NODE_ENV === 'production' && urls.some((u) => !u.toLowerCase().startsWith('ldaps://'))) {
    if (!warnedInsecureUrl) {
      console.error('[auth] AD sign-in is disabled: LDAP_URL must use ldaps:// in production.');
      warnedInsecureUrl = true;
    }
    return false;
  }
  return true;
}

/**
 * Local AIdea passwords (users.password_hash) only work under `npm run dev`
 * and the test runner, for the seeded demo accounts. A production build signs
 * in through AD only.
 */
export function localPasswordsAllowed() {
  return process.env.NODE_ENV !== 'production';
}

/** IT's read-only service account is configured: look users up before checking the password. */
export function usesServiceAccount() {
  return Boolean(process.env.LDAP_BIND_DN && process.env.LDAP_BIND_PASSWORD);
}

/** First server sign-in uses, for the admin settings page. */
export function ldapServerLabel() {
  const [first] = ldapUrls();
  if (!first) return null;
  try {
    const url = new URL(first);
    return `${url.protocol}//${url.host}`;
  } catch {
    return first;
  }
}

let caCache: { path: string; pem: Buffer } | null = null;

function caCert() {
  const path = process.env.LDAP_CA_CERT_PATH;
  if (!path) return undefined;
  if (caCache?.path !== path) caCache = { path, pem: fs.readFileSync(path) };
  return caCache.pem;
}

export function ldapCaLoaded() {
  try {
    return Boolean(caCert());
  } catch {
    return false;
  }
}

function loginAttributes() {
  const configured = (process.env.LDAP_LOGIN_ATTRIBUTES ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter((a) => /^[A-Za-z][A-Za-z0-9-]*$/.test(a));
  return configured.length ? configured : DEFAULT_LOGIN_ATTRIBUTES;
}

/** Accepts `user`, `DOMAIN\user` or `user@domain`; returns the part AD can match. */
export function normalizeLogin(login: string) {
  const trimmed = login.trim();
  const slash = trimmed.lastIndexOf('\\');
  return (slash >= 0 ? trimmed.slice(slash + 1) : trimmed).toLowerCase();
}

/** `DC=corp,DC=godrej,DC=com` → `corp.godrej.com`. */
export function dnsDomainOf(baseDn: string) {
  return baseDn
    .split(',')
    .map((part) => part.trim().match(/^DC=(.+)$/i)?.[1])
    .filter(Boolean)
    .join('.')
    .toLowerCase();
}

/**
 * The name to bind as when there is no service account. Emails/UPNs and
 * DOMAIN\id bind as typed; a bare network ID becomes LDAP_DOMAIN\id (or, in
 * development, this PC's USERDOMAIN), else id@<DNS domain of the base DN>,
 * which AD accepts as an implicit UPN.
 */
export function bindName(login: string, baseDn: string) {
  const trimmed = login.trim();
  if (trimmed.includes('\\') || trimmed.includes('@')) return trimmed;
  const domain = process.env.LDAP_DOMAIN || (process.env.NODE_ENV !== 'production' ? process.env.USERDOMAIN : '');
  if (domain) return `${domain}\\${trimmed}`;
  const dns = dnsDomainOf(baseDn);
  return dns ? `${trimmed}@${dns}` : trimmed;
}

/** LDAP filter for an enabled-or-not person matching the login on any login attribute (values escaped). */
export function userFilter(login: string) {
  const value = Filter.escape(login);
  const any = loginAttributes()
    .map((attr) => `(${attr}=${value})`)
    .join('');
  return `(&(objectCategory=person)(objectClass=user)(|${any}))`;
}

/** objectGUID bytes (little-endian first three groups) → canonical lowercase GUID string. */
export function formatObjectGuid(bytes: Buffer) {
  if (bytes.length !== 16) throw new Error('objectGUID must be 16 bytes');
  const hex = (b: Buffer) => b.toString('hex');
  const le = (start: number, end: number) => hex(Buffer.from(bytes.subarray(start, end)).reverse());
  return [le(0, 4), le(4, 6), le(6, 8), hex(bytes.subarray(8, 10)), hex(bytes.subarray(10, 16))].join('-');
}

/**
 * AD returns invalidCredentials for several account states and puts the real
 * reason in the diagnostic message ("data 775" etc.).
 */
export function bindFailureReason(err: unknown): AdFailure {
  const message = err instanceof Error ? err.message : String(err);
  if (/data 775/i.test(message)) return 'locked';
  if (/data (532|773)/i.test(message)) return 'password_expired';
  if (/data (533|701)/i.test(message)) return 'disabled';
  return err instanceof InvalidCredentialsError ? 'invalid' : 'unavailable';
}

/** `extra` is for diagnostics (e.g. capturing the TLS socket); it can't change the TLS settings. */
export function newClient(url: string, extra: Partial<ClientOptions> = {}) {
  const timeout = Number(process.env.LDAP_TIMEOUT_MS || 5000);
  return new Client({
    ...extra,
    url,
    timeout,
    connectTimeout: timeout,
    tlsOptions: { ca: caCert(), rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  });
}

function first(value: unknown) {
  const v = Array.isArray(value) ? value[0] : value;
  return v === undefined || v === null ? '' : v;
}

function text(value: unknown) {
  return String(first(value)).trim();
}

/** The RootDSE, which AD serves before anyone signs in. */
export async function readRootDse(client: Client) {
  const { searchEntries } = await client.search('', {
    scope: 'base',
    filter: '(objectClass=*)',
    attributes: ['dnsHostName', 'defaultNamingContext'],
  });
  const root = searchEntries[0] ?? {};
  return { dnsHostName: text(root.dnsHostName), defaultNamingContext: text(root.defaultNamingContext) };
}

const baseDnCache = new Map<string, string>();

/** LDAP_BASE_DN, else the server's defaultNamingContext (read once per server). */
async function baseDnFor(url: string, client: Client) {
  if (process.env.LDAP_BASE_DN) return process.env.LDAP_BASE_DN;
  let baseDn = baseDnCache.get(url);
  if (!baseDn) {
    baseDn = (await readRootDse(client)).defaultNamingContext;
    if (!baseDn) throw new Error('The domain controller returned no base DN. Set LDAP_BASE_DN.');
    baseDnCache.set(url, baseDn);
  }
  return baseDn;
}

/** Search options for a user lookup; readAdUser expects these attributes. */
export function userSearchOptions(login: string) {
  return {
    scope: 'sub' as const,
    filter: userFilter(login),
    attributes: ['objectGUID', 'mail', 'userPrincipalName', 'displayName', 'department', 'title', 'userAccountControl'],
    explicitBufferAttributes: ['objectGUID'],
  };
}

/** The search result for one login → the AD user, or why it can't sign in. */
export function readAdUser(
  searchEntries: Entry[]
): { ok: true; dn: string; user: AdUser } | { ok: false; reason: 'not_found' | 'disabled' } {
  if (searchEntries.length !== 1) return { ok: false, reason: 'not_found' };

  const entry = searchEntries[0];
  const uac = Number(first(entry.userAccountControl) || 0);
  if (uac & ACCOUNTDISABLE) return { ok: false, reason: 'disabled' };

  const guid = first(entry.objectGUID);
  const email = (text(entry.mail) || text(entry.userPrincipalName)).toLowerCase();
  if (!Buffer.isBuffer(guid) || !email.includes('@')) return { ok: false, reason: 'not_found' };

  return {
    ok: true,
    dn: entry.dn,
    user: {
      guid: formatObjectGuid(guid),
      email,
      name: text(entry.displayName),
      department: text(entry.department) || null,
      title: text(entry.title) || null,
    },
  };
}

async function lookupThenBind(url: string, login: string, password: string): Promise<AdAttempt> {
  const lookup = newClient(url);
  let dn: string;
  let user: AdUser;
  try {
    await lookup.bind(process.env.LDAP_BIND_DN!, process.env.LDAP_BIND_PASSWORD!);
    const { searchEntries } = await lookup.search(await baseDnFor(url, lookup), userSearchOptions(normalizeLogin(login)));
    const found = readAdUser(searchEntries);
    if (!found.ok) return { result: found, passwordChecked: false };
    ({ dn, user } = found);
  } finally {
    await lookup.unbind().catch(() => undefined);
  }

  const userClient = newClient(url);
  try {
    await userClient.bind(dn, password);
    return { result: { ok: true, user }, passwordChecked: true };
  } catch (err) {
    const reason = bindFailureReason(err);
    if (reason === 'unavailable') throw err;
    return { result: { ok: false, reason }, passwordChecked: false };
  } finally {
    await userClient.unbind().catch(() => undefined);
  }
}

async function bindAsUser(url: string, login: string, password: string): Promise<AdAttempt> {
  const client = newClient(url);
  try {
    const baseDn = await baseDnFor(url, client);
    try {
      await client.bind(bindName(login, baseDn), password);
    } catch (err) {
      const reason = bindFailureReason(err);
      if (reason === 'unavailable') throw err;
      return { result: { ok: false, reason }, passwordChecked: false };
    }
    const { searchEntries } = await client.search(baseDn, userSearchOptions(normalizeLogin(login)));
    const found = readAdUser(searchEntries);
    return { result: found.ok ? { ok: true, user: found.user } : found, passwordChecked: true };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

/**
 * Checks a login and password on one server, with the service account when
 * configured and as the user otherwise. Throws when the server can't be reached.
 */
export async function verifyOnServer(url: string, login: string, password: string): Promise<AdAttempt> {
  // An empty password is an LDAP "unauthenticated bind", which AD accepts as a
  // success without checking anything. Never let one through.
  if (!password || !password.trim() || !normalizeLogin(login)) {
    return { result: { ok: false, reason: 'invalid' }, passwordChecked: false };
  }
  return usesServiceAccount() ? lookupThenBind(url, login, password) : bindAsUser(url, login, password);
}

/**
 * Verifies a login (email, UPN, sAMAccountName or DOMAIN\user) and password
 * against AD, trying each server in turn when one is unreachable.
 */
export async function authenticateWithAd(login: string, password: string): Promise<AdResult> {
  if (!password || !password.trim() || !normalizeLogin(login)) return { ok: false, reason: 'invalid' };
  const normalized = normalizeLogin(login);

  for (const url of ldapUrls()) {
    try {
      const { result } = await verifyOnServer(url, login, password);
      if (!result.ok) console.warn(`[auth] AD sign-in refused for "${normalized}": ${result.reason}`);
      return result;
    } catch (err) {
      console.error(`[auth] AD server ${url} unavailable:`, err instanceof Error ? err.message : err);
    }
  }
  return { ok: false, reason: 'unavailable' };
}
