import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * lib/auth/ad-test.ts (the /ad-test developer page) against a fake ldapts
 * Client: binds succeed for the service account and for bind names whose
 * password matches; a search of '' returns the RootDSE.
 */
const directory = {
  entries: [] as Record<string, unknown>[],
  passwords: new Map<string, string>(),
  binds: [] as string[],
  filters: [] as string[],
};

vi.mock('ldapts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ldapts')>();
  class FakeClient {
    async bind(dn: string, password: string) {
      directory.binds.push(dn);
      if (dn === 'CN=svc' && password === 'svc-pass') return;
      if (directory.passwords.get(dn) !== password) throw new actual.InvalidCredentialsError('80090308: data 52e');
    }
    async search(base: string, options: { filter: string }) {
      if (base === '') {
        return { searchEntries: [{ dn: '', dnsHostName: 'dc01.corp.example', defaultNamingContext: 'DC=corp' }], searchReferences: [] };
      }
      directory.filters.push(options.filter);
      return { searchEntries: directory.entries, searchReferences: [] };
    }
    async unbind() {}
  }
  return { ...actual, Client: FakeClient };
});

const { adTestEnabled, adTestSettings, checkConnection, describeConnectionError, verifyUser } = await import('@/lib/auth/ad-test');

const GUID_BYTES = Buffer.from([4, 3, 2, 1, 6, 5, 8, 7, 9, 10, 11, 12, 13, 14, 15, 16]);
const JDOE = {
  dn: 'CN=John Doe,OU=Users,DC=corp',
  objectGUID: GUID_BYTES,
  mail: 'John.Doe@godrejcp.com',
  displayName: 'John Doe',
  department: 'Supply Chain',
  userAccountControl: '512',
};

beforeEach(() => {
  for (const name of ['LDAP_URL', 'LDAP_BASE_DN', 'LDAP_BIND_DN', 'LDAP_BIND_PASSWORD', 'LDAP_CA_CERT_PATH', 'LDAP_DOMAIN']) {
    vi.stubEnv(name, '');
  }
  vi.stubEnv('USERDOMAIN', 'CORP');
  vi.stubEnv('USERDNSDOMAIN', 'CORP.EXAMPLE');
  vi.stubEnv('LOGONSERVER', '\\\\DC01');
  directory.entries = [JDOE];
  directory.passwords = new Map([['CORP\\jdoe', 'Correct#1']]);
  directory.binds = [];
  directory.filters = [];
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('settings', () => {
  it('is never enabled in production', () => {
    expect(adTestEnabled()).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    expect(adTestEnabled()).toBe(false);
  });

  it("uses this PC's logon server until LDAP_URL is set", () => {
    expect(adTestSettings()).toMatchObject({ url: 'ldaps://dc01.corp.example:636', urlSource: 'this PC', serviceAccount: false });
    vi.stubEnv('LDAP_URL', 'ldaps://dc02.corp.example:636,ldaps://dc03.corp.example:636');
    expect(adTestSettings()).toMatchObject({ url: 'ldaps://dc02.corp.example:636', urlSource: 'LDAP_URL' });
  });
});

describe('checkConnection', () => {
  it('reads the base DN from the RootDSE without signing in', async () => {
    const { step, baseDn } = await checkConnection('ldaps://dc01.corp.example:636');
    expect(step.status).toBe('ok');
    expect(step.detail).toContain('dc01.corp.example');
    expect(baseDn).toBe('DC=corp');
    expect(directory.binds).toEqual([]);
  });

  it('explains an untrusted certificate', () => {
    const err = Object.assign(new Error('unable to get local issuer certificate'), { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' });
    expect(describeConnectionError(err)).toContain('LDAP_CA_CERT_PATH');
  });
});

describe('verifyUser', () => {
  const url = 'ldaps://dc01.corp.example:636';

  it('binds directly as the user and reads their record when there is no service account', async () => {
    const { result } = await verifyUser(url, 'jdoe', 'Correct#1');
    expect(result).toEqual({
      ok: true,
      user: {
        guid: '01020304-0506-0708-090a-0b0c0d0e0f10',
        email: 'john.doe@godrejcp.com',
        name: 'John Doe',
        department: 'Supply Chain',
        title: null,
      },
    });
    expect(directory.binds).toEqual(['CORP\\jdoe']);
    expect(directory.filters[0]).toContain('(sAMAccountName=jdoe)');
  });

  it('rejects a wrong password before reading anything', async () => {
    expect(await verifyUser(url, 'CORP\\wrongpw', 'nope')).toEqual({
      result: { ok: false, reason: 'invalid' },
      passwordChecked: false,
    });
    expect(directory.filters).toEqual([]);
  });

  it('never binds with an empty password', async () => {
    expect((await verifyUser(url, 'jdoe', '  ')).result).toEqual({ ok: false, reason: 'invalid' });
    expect(directory.binds).toEqual([]);
  });

  it('reports a missing record after the password was accepted', async () => {
    directory.passwords.set('CORP\\norecord', 'Correct#1');
    directory.entries = [];
    expect(await verifyUser(url, 'norecord', 'Correct#1')).toEqual({
      result: { ok: false, reason: 'not_found' },
      passwordChecked: true,
    });
  });

  it('stops after 3 password checks so AD never locks the account', async () => {
    for (let i = 0; i < 3; i++) expect((await verifyUser(url, 'guarded', 'bad')).result).toEqual({ ok: false, reason: 'invalid' });
    expect((await verifyUser(url, 'guarded', 'bad')).result).toEqual({ ok: false, reason: 'throttled' });
    expect(directory.binds).toHaveLength(3);
  });

  it('uses the production lookup once the service account is configured', async () => {
    vi.stubEnv('LDAP_URL', url);
    vi.stubEnv('LDAP_BASE_DN', 'DC=corp');
    vi.stubEnv('LDAP_BIND_DN', 'CN=svc');
    vi.stubEnv('LDAP_BIND_PASSWORD', 'svc-pass');
    directory.passwords.set(JDOE.dn, 'Correct#1');
    const { result } = await verifyUser(url, 'CORP\\jdoe', 'Correct#1');
    expect(result.ok).toBe(true);
    expect(directory.binds).toEqual(['CN=svc', JDOE.dn]);
  });
});
