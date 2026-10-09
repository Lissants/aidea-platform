import 'server-only';

import os from 'node:os';
import tls from 'node:tls';
import {
  ldapCaLoaded,
  ldapUrls,
  newClient,
  normalizeLogin,
  readRootDse,
  usesServiceAccount,
  verifyOnServer,
  type AdAttempt,
} from '@/lib/auth/ldap';

/**
 * Developer check behind /ad-test: runs the real AD sign-in (lib/auth/ldap.ts)
 * one step at a time so a failure says which step broke. Never available in
 * production builds.
 */

export type StepStatus = 'ok' | 'fail' | 'skipped';
export type Step = { label: string; status: StepStatus; detail: string };

export function adTestEnabled() {
  return process.env.NODE_ENV !== 'production';
}

/** DOMAIN\user of the Windows account running `next dev`. */
export function machineLogin() {
  const user = os.userInfo().username;
  return process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\${user}` : user;
}

export function adTestSettings() {
  const [url] = ldapUrls();
  return {
    url: url ?? null,
    urlSource: process.env.LDAP_URL?.trim() ? 'LDAP_URL' : 'this PC',
    baseDn: process.env.LDAP_BASE_DN || null,
    caPath: process.env.LDAP_CA_CERT_PATH || null,
    caLoaded: ldapCaLoaded(),
    /** IT's service account is set: users are looked up before the password check. */
    serviceAccount: usesServiceAccount(),
  };
}

const UNTRUSTED_CERT = /^(UNABLE_TO_GET_ISSUER_CERT|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT)$/;

/** A connection error in words a developer can act on. */
export function describeConnectionError(err: unknown) {
  const code = (err as { code?: string } | null)?.code ?? '';
  const message = err instanceof Error ? err.message : String(err);
  if (UNTRUSTED_CERT.test(code)) {
    return `Node doesn't trust the domain controller's certificate (${code}). Export the corporate root CA to PEM and set LDAP_CA_CERT_PATH.`;
  }
  if (code === 'CERT_HAS_EXPIRED') return "The domain controller's certificate has expired.";
  if (code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
    return `The certificate doesn't cover this host name. Use the domain controller's full DNS name in LDAP_URL. (${message})`;
  }
  if (['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code) || /timeout/i.test(message)) {
    return `The domain controller didn't answer (${code || message}). Check the network or VPN and that port 636 is open.`;
  }
  if (code === 'ENOTFOUND') return `The host name doesn't resolve (${message}).`;
  return message;
}

/**
 * Connects (TLS included) and reads the RootDSE, which AD serves without
 * signing in. Returns the base DN to search: LDAP_BASE_DN, else the domain's
 * defaultNamingContext.
 */
export async function checkConnection(url: string): Promise<{ step: Step; baseDn: string | null }> {
  const label = 'Reach the domain controller';
  let socket: tls.TLSSocket | undefined;
  const client = newClient(url, {
    createSecureConnection: ((port: number, host?: string, options?: tls.ConnectionOptions) => {
      socket = tls.connect(port, host, options);
      return socket;
    }) as typeof tls.connect,
  });
  const started = Date.now();
  try {
    const root = await readRootDse(client);
    const host = root.dnsHostName || new URL(url).hostname;
    const baseDn = process.env.LDAP_BASE_DN || root.defaultNamingContext || null;
    const transport = socket
      ? `${socket.getProtocol()}, certificate issued by ${String(socket.getPeerCertificate().issuer?.CN ?? '') || 'unknown CA'}`
      : 'not encrypted (ldap://)';
    return {
      step: { label, status: 'ok', detail: `${host} answered in ${Date.now() - started} ms over ${transport}. Base DN ${baseDn ?? 'unknown'}.` },
      baseDn,
    };
  } catch (err) {
    return { step: { label, status: 'fail', detail: describeConnectionError(err) }, baseDn: null };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

// AD locks an account after a few bad passwords; stop well before that.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PASSWORD_CHECKS = 3;
const passwordChecks = new Map<string, { count: number; first: number }>();

function passwordChecksExhausted(key: string) {
  const now = Date.now();
  const entry = passwordChecks.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    passwordChecks.set(key, { count: 1, first: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PASSWORD_CHECKS;
}

export type VerifyResult = {
  result: AdAttempt['result'] | { ok: false; reason: 'throttled' };
  /** The password was accepted before the record check failed. */
  passwordChecked: boolean;
};

/** Checks the password and reads the user's AD record on one server. The password is never stored or logged. */
export async function verifyUser(url: string, login: string, password: string): Promise<VerifyResult> {
  const key = normalizeLogin(login);
  if (!password || !password.trim() || !key) {
    return { result: { ok: false, reason: 'invalid' }, passwordChecked: false };
  }
  if (passwordChecksExhausted(key)) return { result: { ok: false, reason: 'throttled' }, passwordChecked: false };

  const verified = await verifyOnServer(url, login, password);
  if (verified.result.ok) passwordChecks.delete(key);
  return verified;
}
