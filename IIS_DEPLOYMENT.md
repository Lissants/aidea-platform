# IIS Deployment: AD Sign-in and Encryption

This guide hardens the Windows self-hosted setup in [SELF_HOSTING_WINDOWS.md](./SELF_HOSTING_WINDOWS.md) for production. It covers:

1. Signing users in with their **on-premises Active Directory** account over **LDAPS**
2. **Encryption in transit**: browser ↔ IIS (HTTPS), app ↔ SQL Server (TLS), app ↔ domain controller (LDAPS)
3. **Encryption at rest**: SQL Server TDE for the database, BitLocker for uploads and backups

Follow SELF_HOSTING_WINDOWS.md §1–9 first (prerequisites, database, NSSM service), then this guide.

To run AIdea in IIS on a developer PC instead (IIS starts Node itself, `http://localhost:8080`), see [deploy/iis/README.md](./deploy/iis/README.md).

**Production host:** `https://aidea.godrejindonesia.com`, on the company's Windows Server. IIS listens on 443 (and 80, only to redirect to HTTPS) and forwards to Node on `127.0.0.1:3000`.

## What to ask IT for

| Item | Used for |
| --- | --- |
| DNS `A` record for `aidea.godrejindonesia.com` pointing at the Windows Server's IP | Users reach the app by name |
| A TLS certificate whose Subject Alternative Name includes `aidea.godrejindonesia.com`, with its private key (`.pfx`). Use the corporate CA if only domain-joined devices on the corporate network will use AIdea; use a public CA if it must also work from outside that network or on non-domain devices | HTTPS in IIS |
| Domain controller host names that serve LDAPS on port 636 | `LDAP_URL` |
| The NetBIOS domain name (e.g. `CORP`), for people who type a bare network ID | `LDAP_DOMAIN` |
| Optional: base DN of the user OU(s), e.g. `OU=Users,DC=corp,DC=godrej,DC=com` (otherwise the whole domain) | `LDAP_BASE_DN` |
| Optional: a read-only **service account** (no interactive logon, password never expires or a rotation owner) | `LDAP_BIND_DN` / `LDAP_BIND_PASSWORD` |
| The corporate **root CA certificate** in PEM (Base-64) format | `LDAP_CA_CERT_PATH`, trust for SQL Server |
| A certificate for the SQL Server's FQDN from the corporate CA | Validated SQL TLS |
| Firewall: app server → DCs on TCP 636; app server → SQL Server on TCP 1433 | Network |

## 1. Active Directory sign-in (LDAPS)

### How it works

AD is the **only** way into a production build: there are no AIdea passwords. The user types their **email or network ID** (`jdoe`, `CORP\jdoe` or `jdoe@godrejcp.com`) and their **Windows password**.

Without a service account (the default), AIdea:

1. binds to a domain controller over LDAPS **as the user**: an email or `CORP\jdoe` as typed, a bare `jdoe` as `LDAP_DOMAIN\jdoe` (or `jdoe@<DNS domain>` when `LDAP_DOMAIN` is empty);
2. over that connection, reads the user's own record (`mail`, `displayName`, `department`, `title`, `objectGUID`).

With `LDAP_BIND_DN` / `LDAP_BIND_PASSWORD` set, it switches automatically to a lookup first: bind as the service account, find exactly one matching user, refuse disabled accounts, then bind as that user with the typed password.

The password exists only in memory for that bind. It is never stored or logged. The account's email domain must be in `ALLOWED_EMAIL_DOMAIN`.

At every sign-in AIdea copies the **name, department and title** from AD; users can't edit them, or a password, in AIdea. Accounts are linked to the AD `objectGUID`, so renames and email changes in AD carry over, and existing AIdea accounts with the same email are linked automatically (any old AIdea password on them is removed).

**Roles:** a first sign-in creates the account as **User**. Admins promote people to Mentor in **User Management**, and that sticks. The emails in `AD_DEVELOPER_EMAILS` and `AD_ADMIN_EMAILS` are put on Developer / Admin at every sign-in and show as *Set in server settings* in User Management; every such change is written to the audit log.

**Sessions** renew while in use but always end 24 hours after sign-in, so a disabled Windows account loses access within a day. To block someone immediately, deactivate them in User Management.

AIdea allows 5 attempts per login per 10 minutes, so it can't be used to trip the AD lockout policy. Locked and expired-password accounts get a specific message; everything else gets "Invalid email or password".

This is password sign-in against AD, not silent single sign-on, and AD itself provides no MFA here.

### Configure

1. Copy the root CA to the server, e.g. `C:\aidea\certs\corp-root-ca.pem`. Only the service account running AIdea needs read access to it.
2. Add to `.env.local`:

   ```ini
   LDAP_URL=ldaps://dc01.corp.godrej.com:636,ldaps://dc02.corp.godrej.com:636
   LDAP_DOMAIN=CORP
   LDAP_CA_CERT_PATH=C:\aidea\certs\corp-root-ca.pem
   ALLOWED_EMAIL_DOMAIN=godrejcp.com
   AD_DEVELOPER_EMAILS=christopher.gerard@godrejcp.com
   AD_ADMIN_EMAILS=setyarini@godrejcp.com,pahru.rozi@godrejcp.com,fitri.damayanti@godrejcp.com
   # Optional, once IT provides them:
   # LDAP_BASE_DN=OU=Users,DC=corp,DC=godrej,DC=com
   # LDAP_BIND_DN=CN=svc-aidea,OU=Service Accounts,DC=corp,DC=godrej,DC=com
   # LDAP_BIND_PASSWORD=<service account password>
   ```

   Leave the `MICROSOFT_*` variables empty. The **Sign in with Microsoft** button then stays hidden.
3. Apply the migrations (`users.ad_object_guid`, and removing the formerly seeded Developers): `npm run db:migrate` (from an account with `db_owner`).
4. Rebuild and restart: `npm run build`, `nssm restart AIdea`.
5. Sign in with a Windows account listed in `AD_DEVELOPER_EMAILS` or `AD_ADMIN_EMAILS` and open **Settings**. It should say *Active Directory sign-in (LDAPS): Configured — ldaps://dc01…, signs in as the user, corporate CA loaded*.

In production AIdea refuses `ldap://` URLs: AD sign-in stays off, nobody can sign in, and the log says why (the service also logs it at start-up). Certificates are always validated (`rejectUnauthorized`, TLS 1.2+). A DC presenting a certificate the CA didn't issue, or a host name that doesn't match it, is treated as unavailable, and the next DC in `LDAP_URL` is tried.

### No local passwords

A production build has no break-glass AIdea password: if no domain controller answers, nobody can sign in, admins included. Keep at least two DCs in `LDAP_URL`. Local passwords exist only under `npm run dev` and the tests, for the seeded demo accounts.

### Check from the server

```powershell
Test-NetConnection dc01.corp.godrej.com -Port 636
```

If sign-in says "temporarily unavailable", the log (`logs\aidea.err.log`) shows `[auth] AD server … unavailable:` with the reason. The usual causes:
- **Certificate errors:** a wrong CA file, or `LDAP_URL` using an IP instead of the name on the certificate.
- **Invalid credentials on the service bind** (service account only): the service account's password has changed.

## 2. Encryption in transit

### Browser ↔ IIS (HTTPS)

1. Set up IIS, URL Rewrite and ARR as in SELF_HOSTING_WINDOWS.md §10 ("HTTPS with IIS as a reverse proxy").
2. Use [`deploy/iis/web.config`](./deploy/iis/web.config) as the site's `web.config`. It redirects HTTP to HTTPS, proxies to `127.0.0.1:3000`, sets `X-Forwarded-Proto`, and allows 30 MB uploads. In IIS Manager → the site → **URL Rewrite → View Server Variables**, add `HTTP_X_FORWARDED_PROTO` and `HTTP_X_FORWARDED_HOST`.
3. **Make Node reachable only through IIS.** Change the NSSM service to listen on loopback:

   ```powershell
   & $nssm set AIdea AppParameters "node_modules\next\dist\bin\next start -H 127.0.0.1 -p 3000"
   & $nssm restart AIdea
   Remove-NetFirewallRule -DisplayName "AIdea (TCP 3000)" -ErrorAction SilentlyContinue
   ```

4. **TLS 1.2+ only.** Disable SSL 3.0, TLS 1.0 and TLS 1.1 on the server (Group Policy or IIS Crypto, following Godrej's server baseline). Import the `.pfx` into *Local Computer → Personal*, then give the site exactly two bindings:

   | Type | Port | Host name | Certificate |
   | --- | --- | --- | --- |
   | https | 443 | `aidea.godrejindonesia.com` | the `aidea.godrejindonesia.com` certificate. Tick **Require Server Name Indication** if this server hosts other HTTPS sites |
   | http | 80 | `aidea.godrejindonesia.com` | — (only redirects to HTTPS) |

5. In `.env.local`: set `NEXT_PUBLIC_APP_URL=https://aidea.godrejindonesia.com` (no trailing slash) and **remove** `SESSION_COOKIE_SECURE=false`. Rebuild and restart. The URL is baked into the build, so changing it later needs `npm run build` again.

If Microsoft sign-in is turned on later, the Entra app registration needs the redirect URI `https://aidea.godrejindonesia.com/auth/callback/microsoft` and the front-channel logout URL `https://aidea.godrejindonesia.com/sign-in`.

AIdea itself sends these on every response: `Strict-Transport-Security` (1 year, production only), `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` and `Permissions-Policy`. Session cookies are `HttpOnly`, `SameSite=Lax` and `Secure`. At startup the log prints `[security] …` warnings if any production setting would allow plain-text traffic.

### App ↔ SQL Server

Connections are encrypted (`MSSQL_ENCRYPT`, default `true`). In production the SQL Server certificate is now **validated** (`MSSQL_TRUST_CERT` defaults to `false`), so:

1. Install a certificate for the SQL Server's FQDN from the corporate CA (SQL Server Configuration Manager → *Protocols for MSSQLSERVER → Properties → Certificate*). Optionally set **Force Encryption = Yes**. Restart SQL Server.
2. Make sure the corporate root CA is in the app server's **Trusted Root Certification Authorities**. Domain-joined servers usually already have it.
3. Set `MSSQL_SERVER` to that FQDN (not `.` or an IP), so the name matches the certificate.

Check, from the app's own connection:

```sql
SELECT encrypt_option FROM sys.dm_exec_connections WHERE session_id = @@SPID;  -- TRUE
```

Until the certificate is in place you can set `MSSQL_TRUST_CERT=true` temporarily. Traffic is still encrypted, but the startup log warns that the server isn't verified.

### App ↔ domain controller

LDAPS only, with a validated certificate (section 1).

### Email

AIdea queues email in `email_outbox` and sends nothing yet. When a real sender is added it must use TLS (see `lib/email/adapter.ts`).

## 3. Encryption at rest

No app changes are needed. Both are transparent to AIdea.

### Database: Transparent Data Encryption (TDE)

SQL Server 2019 Standard and Enterprise both support TDE. A DBA runs:

```sql
USE master;
CREATE MASTER KEY ENCRYPTION BY PASSWORD = '<strong password>';
CREATE CERTIFICATE AIdeaTDE WITH SUBJECT = 'AIdea TDE certificate';

-- Back up the certificate and key NOW and store them off this server.
-- Without them no backup of the database can ever be restored.
BACKUP CERTIFICATE AIdeaTDE TO FILE = 'D:\secure\AIdeaTDE.cer'
  WITH PRIVATE KEY (FILE = 'D:\secure\AIdeaTDE.pvk', ENCRYPTION BY PASSWORD = '<another strong password>');

USE aidea;
CREATE DATABASE ENCRYPTION KEY WITH ALGORITHM = AES_256 ENCRYPTION BY SERVER CERTIFICATE AIdeaTDE;
ALTER DATABASE aidea SET ENCRYPTION ON;
```

Check that `encryption_state` is `3` (encrypted):

```sql
SELECT DB_NAME(database_id) AS db, encryption_state FROM sys.dm_database_encryption_keys;
```

From then on, data files, log files and **backups** are encrypted. Restoring on another server needs the certificate first: `CREATE CERTIFICATE AIdeaTDE FROM FILE = … WITH PRIVATE KEY (…)`.

### Uploaded files and backups: BitLocker

Uploads (`UPLOAD_DIR`) are plain files. Put them, and the folder SQL backups are written to, on a **BitLocker**-encrypted volume (escrow the recovery key in AD as IT normally does). Off-server copies of backups must also be encrypted.

## Go-live checklist

- [ ] `nslookup aidea.godrejindonesia.com` returns the Windows Server's IP from a user's PC.
- [ ] `https://aidea.godrejindonesia.com/sign-in` loads with a trusted certificate issued for that name; `http://aidea.godrejindonesia.com` redirects to `https://`.
- [ ] `http://<server>:3000` is **not** reachable from another machine.
- [ ] `curl.exe -sI https://aidea.godrejindonesia.com/sign-in` shows `Strict-Transport-Security` and `X-Frame-Options: DENY`.
- [ ] No `[security]` warnings in `logs\aidea.err.log` after a restart.
- [ ] An AD user signs in with network ID + Windows password; a wrong password, a disabled account and an unknown user are refused.
- [ ] Settings shows *Active Directory sign-in (LDAPS): Configured … corporate CA loaded*.
- [ ] `sys.dm_exec_connections.encrypt_option` = TRUE with `MSSQL_TRUST_CERT` unset.
- [ ] TDE `encryption_state` = 3, and the TDE certificate backup is stored off-server.
- [ ] `UPLOAD_DIR` and the backup folder are on BitLocker volumes.
