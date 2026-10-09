import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * lib/auth/ldap.ts against a fake ldapts Client: the directory is a list of
 * entries, binds succeed for the service account and for bind names (DNs,
 * UPNs, DOMAIN\user) whose password matches, a search of '' returns the
 * RootDSE, and `down` makes every connection fail.
 */
const directory = {
  entries: [] as Record<string, unknown>[],
  passwords: new Map<string, string>(),
  down: new Set<string>(),
  bindError: null as Error | null,
  filters: [] as string[],
  binds: [] as string[],
};

vi.mock('ldapts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ldapts')>();
  class FakeClient {
    constructor(private options: { url: string }) {}
    async bind(dn: string, password: string) {
      if (directory.down.has(this.options.url)) throw new Error('connect ECONNREFUSED');
      directory.binds.push(dn);
      if (dn === 'CN=svc' && password === 'svc-pass') return;
      if (directory.bindError) throw directory.bindError;
      if (directory.passwords.get(dn) !== password) throw new actual.InvalidCredentialsError('80090308: data 52e');
    }
    async search(base: string, options: { filter: string }) {
      if (directory.down.has(this.options.url)) throw new Error('connect ECONNREFUSED');
      if (base === '') return { searchEntries: [{ dn: '', defaultNamingContext: 'DC=corp,DC=godrej,DC=com' }], searchReferences: [] };
      directory.filters.push(options.filter);
      return { searchEntries: directory.entries, searchReferences: [] };
    }
    async unbind() {}
  }
  return { ...actual, Client: FakeClient };
});

const { authenticateWithAd, bindName, dnsDomainOf, formatObjectGuid, isAdEnabled, localPasswordsAllowed, normalizeLogin, userFilter } =
  await import('@/lib/auth/ldap');
const { InvalidCredentialsError } = await import('ldapts');

const GUID_BYTES = Buffer.from([4, 3, 2, 1, 6, 5, 8, 7, 9, 10, 11, 12, 13, 14, 15, 16]);
const GUID = '01020304-0506-0708-090a-0b0c0d0e0f10';

function jdoe(overrides: Record<string, unknown> = {}) {
  return {
    dn: 'CN=John Doe,OU=Users,DC=corp',
    objectGUID: GUID_BYTES,
    mail: 'John.Doe@godrejcp.com',
    userPrincipalName: 'jdoe@corp.godrej.com',
    displayName: 'John Doe',
    department: 'Supply Chain',
    title: 'Analyst',
    userAccountControl: '512',
    ...overrides,
  };
}

const JDOE = { guid: GUID, email: 'john.doe@godrejcp.com', name: 'John Doe', department: 'Supply Chain', title: 'Analyst' };

function configure(url = 'ldaps://dc01:636') {
  // No fallback to this PC's own domain controller while testing.
  for (const name of ['USERDNSDOMAIN', 'LOGONSERVER', 'USERDOMAIN', 'LDAP_DOMAIN']) vi.stubEnv(name, '');
  vi.stubEnv('LDAP_URL', url);
  vi.stubEnv('LDAP_BASE_DN', 'DC=corp');
  vi.stubEnv('LDAP_BIND_DN', 'CN=svc');
  vi.stubEnv('LDAP_BIND_PASSWORD', 'svc-pass');
  vi.stubEnv('LDAP_CA_CERT_PATH', '');
}

beforeEach(() => {
  configure();
  directory.entries = [jdoe()];
  directory.passwords = new Map([['CN=John Doe,OU=Users,DC=corp', 'Correct#1']]);
  directory.down = new Set();
  directory.bindError = null;
  directory.filters = [];
  directory.binds = [];
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('LDAP configuration', () => {
  it('is on with just a server: the service account is optional', () => {
    vi.stubEnv('LDAP_BIND_DN', '');
    vi.stubEnv('LDAP_BIND_PASSWORD', '');
    vi.stubEnv('LDAP_BASE_DN', '');
    expect(isAdEnabled()).toBe(true);
    vi.stubEnv('LDAP_URL', '');
    expect(isAdEnabled()).toBe(false);
  });

  it("falls back to this PC's domain controller outside production only", () => {
    vi.stubEnv('LDAP_URL', '');
    vi.stubEnv('USERDNSDOMAIN', 'CORP.GODREJ.COM');
    vi.stubEnv('LOGONSERVER', '\\\\DC07');
    expect(isAdEnabled()).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    expect(isAdEnabled()).toBe(false);
  });

  it('refuses plain ldap:// in production', () => {
    configure('ldap://dc01:389');
    vi.stubEnv('NODE_ENV', 'production');
    expect(isAdEnabled()).toBe(false);
    configure('ldaps://dc01:636');
    expect(isAdEnabled()).toBe(true);
  });

  it('allows local passwords only outside production', () => {
    expect(localPasswordsAllowed()).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    expect(localPasswordsAllowed()).toBe(false);
  });
});

describe('login handling', () => {
  it('normalizes DOMAIN\\user, UPNs and case', () => {
    expect(normalizeLogin('  CORP\\JDoe ')).toBe('jdoe');
    expect(normalizeLogin('John.Doe@GodrejCP.com')).toBe('john.doe@godrejcp.com');
  });

  it('escapes filter metacharacters so a login cannot widen the search', () => {
    const filter = userFilter('*)(objectClass=*');
    expect(filter).toBe(
      '(&(objectCategory=person)(objectClass=user)(|(mail=\\2a\\29\\28objectClass=\\2a)(userPrincipalName=\\2a\\29\\28objectClass=\\2a)(sAMAccountName=\\2a\\29\\28objectClass=\\2a)))'
    );
    expect(userFilter('a\\b')).toContain('(mail=a\\5cb)');
  });

  it('formats objectGUID bytes in AD byte order', () => {
    expect(formatObjectGuid(GUID_BYTES)).toBe(GUID);
  });
});

describe('authenticateWithAd', () => {
  it('signs in with the right password and returns the AD identity', async () => {
    const result = await authenticateWithAd('CORP\\jdoe', 'Correct#1');
    expect(result).toEqual({ ok: true, user: JDOE });
    expect(directory.binds).toEqual(['CN=svc', 'CN=John Doe,OU=Users,DC=corp']);
  });

  it('falls back to the UPN when mail is empty', async () => {
    directory.entries = [jdoe({ mail: undefined })];
    const result = await authenticateWithAd('jdoe', 'Correct#1');
    expect(result.ok && result.user.email).toBe('jdoe@corp.godrej.com');
  });

  it('never binds with an empty password (AD treats it as an anonymous success)', async () => {
    expect(await authenticateWithAd('jdoe', '')).toEqual({ ok: false, reason: 'invalid' });
    expect(await authenticateWithAd('jdoe', '   ')).toEqual({ ok: false, reason: 'invalid' });
    expect(directory.binds).toEqual([]);
  });

  it('rejects a wrong password', async () => {
    expect(await authenticateWithAd('jdoe', 'wrong')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('reports not_found for zero or several matches', async () => {
    directory.entries = [];
    expect(await authenticateWithAd('nobody', 'x')).toEqual({ ok: false, reason: 'not_found' });
    directory.entries = [jdoe(), jdoe({ dn: 'CN=Other' })];
    expect(await authenticateWithAd('jdoe', 'Correct#1')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('refuses a disabled account without trying its password', async () => {
    directory.entries = [jdoe({ userAccountControl: '514' })];
    expect(await authenticateWithAd('jdoe', 'Correct#1')).toEqual({ ok: false, reason: 'disabled' });
    expect(directory.binds).toEqual(['CN=svc']);
  });

  it('maps AD lockout and expired-password codes', async () => {
    directory.bindError = new InvalidCredentialsError('80090308: LdapErr: DSID-0C09044E, data 775, v4563');
    expect(await authenticateWithAd('jdoe', 'Correct#1')).toEqual({ ok: false, reason: 'locked' });
    directory.bindError = new InvalidCredentialsError('80090308: LdapErr: DSID-0C09044E, data 532, v4563');
    expect(await authenticateWithAd('jdoe', 'Correct#1')).toEqual({ ok: false, reason: 'password_expired' });
  });

  it('tries the next domain controller when one is down', async () => {
    configure('ldaps://dc01:636,ldaps://dc02:636');
    directory.down.add('ldaps://dc01:636');
    expect((await authenticateWithAd('jdoe', 'Correct#1')).ok).toBe(true);
  });

  it('reports unavailable when every domain controller is down', async () => {
    directory.down.add('ldaps://dc01:636');
    expect(await authenticateWithAd('jdoe', 'Correct#1')).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('authenticateWithAd without a service account', () => {
  beforeEach(() => {
    vi.stubEnv('LDAP_BIND_DN', '');
    vi.stubEnv('LDAP_BIND_PASSWORD', '');
    vi.stubEnv('LDAP_BASE_DN', '');
    directory.passwords = new Map([
      ['john.doe@godrejcp.com', 'Correct#1'],
      ['CORP\\jdoe', 'Correct#1'],
      ['jdoe@corp.godrej.com', 'Correct#1'],
    ]);
  });

  it('binds as the typed email, then reads the record with department and title', async () => {
    expect(await authenticateWithAd('john.doe@godrejcp.com', 'Correct#1')).toEqual({ ok: true, user: JDOE });
    expect(directory.binds).toEqual(['john.doe@godrejcp.com']);
    expect(directory.filters[0]).toContain('(mail=john.doe@godrejcp.com)');
  });

  it('binds DOMAIN\\user as typed and searches by the network ID', async () => {
    expect((await authenticateWithAd('CORP\\jdoe', 'Correct#1')).ok).toBe(true);
    expect(directory.binds).toEqual(['CORP\\jdoe']);
    expect(directory.filters[0]).toContain('(sAMAccountName=jdoe)');
  });

  it('turns a bare network ID into LDAP_DOMAIN\\id, else id@<domain from the base DN>', async () => {
    vi.stubEnv('LDAP_DOMAIN', 'CORP');
    expect((await authenticateWithAd('jdoe', 'Correct#1')).ok).toBe(true);
    vi.stubEnv('LDAP_DOMAIN', '');
    expect((await authenticateWithAd('jdoe', 'Correct#1')).ok).toBe(true);
    expect(directory.binds).toEqual(['CORP\\jdoe', 'jdoe@corp.godrej.com']);
  });

  it('never binds with an empty password', async () => {
    expect(await authenticateWithAd('john.doe@godrejcp.com', ' ')).toEqual({ ok: false, reason: 'invalid' });
    expect(directory.binds).toEqual([]);
  });

  it('cannot tell an unknown login from a wrong password', async () => {
    expect(await authenticateWithAd('nobody@godrejcp.com', 'Correct#1')).toEqual({ ok: false, reason: 'invalid' });
    expect(await authenticateWithAd('john.doe@godrejcp.com', 'wrong')).toEqual({ ok: false, reason: 'invalid' });
    expect(directory.filters).toEqual([]);
  });

  it('reports a disabled account and AD lockout from the bind error', async () => {
    directory.bindError = new InvalidCredentialsError('80090308: LdapErr: DSID-0C09044E, data 533, v4563');
    expect(await authenticateWithAd('john.doe@godrejcp.com', 'Correct#1')).toEqual({ ok: false, reason: 'disabled' });
    directory.bindError = new InvalidCredentialsError('80090308: LdapErr: DSID-0C09044E, data 775, v4563');
    expect(await authenticateWithAd('john.doe@godrejcp.com', 'Correct#1')).toEqual({ ok: false, reason: 'locked' });
  });

  it('reports not_found when the password works but there is no single record', async () => {
    directory.entries = [];
    expect(await authenticateWithAd('john.doe@godrejcp.com', 'Correct#1')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('tries the next domain controller when one is down', async () => {
    configure('ldaps://dc01:636,ldaps://dc02:636');
    vi.stubEnv('LDAP_BIND_DN', '');
    vi.stubEnv('LDAP_BIND_PASSWORD', '');
    vi.stubEnv('LDAP_BASE_DN', '');
    directory.down.add('ldaps://dc01:636');
    expect((await authenticateWithAd('john.doe@godrejcp.com', 'Correct#1')).ok).toBe(true);
  });
});

describe('bindName', () => {
  it('uses USERDOMAIN for a bare network ID in development only', () => {
    vi.stubEnv('USERDOMAIN', 'DEVPC');
    expect(bindName(' jdoe ', 'DC=corp,DC=godrej,DC=com')).toBe('DEVPC\\jdoe');
    vi.stubEnv('NODE_ENV', 'production');
    expect(bindName('jdoe', 'DC=corp,DC=godrej,DC=com')).toBe('jdoe@corp.godrej.com');
  });

  it('reads the DNS domain from the base DN', () => {
    expect(dnsDomainOf('OU=Users, DC=Corp,DC=Godrej,DC=com')).toBe('corp.godrej.com');
  });
});
