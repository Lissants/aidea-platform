# Local Setup

The fastest route to a working dev environment on your own Windows machine. To replicate the full reference setup (other devices on the LAN, production mode as a Windows service, backups), follow **[SELF_HOSTING_WINDOWS.md](./SELF_HOSTING_WINDOWS.md)** instead.

## 1. Prerequisites

- **Node.js 20.12+** (Node 24 is fine). The Docker image pins `node:20`.
- **Microsoft SQL Server 2019** (Express is fine) running locally, default instance `MSSQLSERVER`.
- **ODBC Driver 18 for SQL Server** (Windows). It ships with SQL Server Management Studio and recent SQL Server installs; it is used by the `msnodesqlv8` driver.
- Your Windows account must be able to create a database on the instance (the default `sysadmin` membership an installer gives you is enough).

No TCP/IP, mixed-mode authentication or SQL login is needed for local development. The app uses Windows authentication over shared memory.

## 2. Install dependencies

```bash
npm install
```

## 3. Create the database

```bash
sqlcmd -S . -E -C -Q "IF DB_ID('aidea') IS NULL CREATE DATABASE aidea"
```

## 4. Configure environment variables

```bash
cp .env.example .env.local
```

For a default local install the SQL Server section can stay as it is: `MSSQL_DRIVER=msnodesqlv8`, `MSSQL_SERVER=.` and `MSSQL_DATABASE=aidea`.

Set `SESSION_SECRET` to a random string of 32 or more characters:

```bash
node -e "console.log(crypto.randomBytes(48).toString('base64url'))"
```

In development the app falls back to a built-in secret if this is unset. Production refuses to start without it.

Leave `ALLOWED_EMAIL_DOMAIN` empty locally, or set it to `godrejcp.com` (the demo accounts use that domain). `.env.example` documents every variable.

## 5. Apply the schema and seed demo data

```bash
npm run db:reset
```

This does three things:

1. It drops every object in the `aidea` database.
2. It applies `db/migrations/*.sql` in filename order (tables, triggers and stored procedures) and records each file in `dbo.schema_migrations`.
3. It seeds the demo users, program, ideas, reviews and votes (`scripts/seed.ts` followed by `db/seed.sql`).

Other database scripts:

| Script | What it does |
| --- | --- |
| `npm run db:migrate` | Applies only the migrations that haven't run yet. It is safe to use against a database that has data in it. |
| `npm run db:seed` | Re-runs the seed. It is idempotent. |

The demo password comes from `DEMO_PASSWORD`, or defaults to the value shown in `README.md`.

The seed creates only demo accounts, and their passwords work only under `npm run dev` and the tests. Real people sign in with their Windows account (Active Directory, see below): everyone starts as User, and the emails in `AD_DEVELOPER_EMAILS` / `AD_ADMIN_EMAILS` become Developer / Admin at sign-in.

> **Running ad-hoc SQL with `sqlcmd`:** pass `-I` (`QUOTED_IDENTIFIER ON`), for example `sqlcmd -S . -E -C -I -d aidea -Q "..."`. The schema uses filtered indexes, and SQL Server rejects writes to those tables when `QUOTED_IDENTIFIER` is off, which is `sqlcmd`'s default. The app's ODBC and TDS connections have it on by default.

## 6. Run the app

```bash
npm run dev
```

Visit `http://localhost:3000` and sign in with a seeded demo account using email and password.

Uploaded files (program resources) are written to `./uploads` (`UPLOAD_DIR`).

If you use Claude Code's preview, `.claude/launch.json` defines an `aidea-dev` configuration that runs `npm run dev` on port 3000.

### Opening the dev server from another device (LAN / VM host)

By default you browse to `http://localhost:3000`. To open the app from a phone, another laptop, or the host of a VM:

1. Find this machine's IPv4 address: `ipconfig` (Windows) or `ip -4 addr` (Linux), on the adapter you're connected with.
2. Set `NEXT_PUBLIC_APP_URL=http://<your-IP>:3000` in `.env.local`.
3. Start with `npm run dev -- -H 0.0.0.0`, allow inbound TCP 3000 through the firewall, and browse to `http://<your-IP>:3000`.

You don't need to edit `next.config.mjs`. In dev mode Next.js only serves its scripts to origins on the `allowedDevOrigins` list, and `next.config.mjs` fills that list with every IPv4 address this machine has whenever the dev server starts. No address is hard-coded, so the same code works on every machine. If you reach the machine through an address it doesn't own (a DNS name, a VM behind NAT), add that address to `DEV_ALLOWED_ORIGINS` in `.env.local` (comma-separated, `*` wildcards allowed, for example `DEV_ALLOWED_ORIGINS=aidea-pc.corp.local,192.168.48.*`). Without it, the page renders but never becomes interactive. Production (`npm run start`) ignores this setting. More detail: [SELF_HOSTING_WINDOWS.md §5](./SELF_HOSTING_WINDOWS.md#5-find-your-ip-address-and-add-it-to-the-config).

### What to try first

Sign in as `demo.participant1@godrejcp.com` and open **Submit New Idea**. The wizard requires a team name and a **Team Leader**, accepts up to **5 team members**, and lets you **Save draft** at any point. Missing fields are only reported when you click **Submit idea**. Then try `demo.admin1@godrejcp.com` (**User Management**, **Voting Management**) and `demo.voter1@godrejcp.com` (**Voting**).

### Optional: Microsoft sign-in (Entra ID)

1. Ask IT for an **App registration** in the Godrej Entra ID tenant. godrejcp.com and godrejinds.com are the same tenant, `bfa3dfb0-91d5-4bf7-9a0c-fbf6ff337187`, so GCPL staff sign in with their usual `name@godrejcp.com` account. The tenant also holds the other Godrej companies, so ask IT to set **Assignment required = Yes** and assign a GCPL group; `ALLOWED_EMAIL_DOMAIN=godrejcp.com` is the second check.

   | Setting | Value |
   |---|---|
   | Supported account types | Single tenant (this organisation only) |
   | Platform | **Web** (not SPA) |
   | Redirect URI | `http://localhost:3000/auth/callback/microsoft`; for other environments `{NEXT_PUBLIC_APP_URL}/auth/callback/microsoft` |
   | Front-channel logout URL | `{NEXT_PUBLIC_APP_URL}/sign-in` |
   | Branding & properties → Home page URL | `{NEXT_PUBLIC_APP_URL}/overview`. My Apps and Grove tiles open this URL. If it is left empty or points at Grove, users who sign in from a tile end up on Grove instead of AIdea |
   | API permissions | Microsoft Graph, delegated: `openid`, `profile`, `email`, `User.Read`, admin consent granted |
   | Client secret | One secret; note its expiry date and rotate it before then |
   | Enterprise app → Assignment required | Yes to limit AIdea to an assigned group; No for everyone in the tenant |

2. Put the **Directory (tenant) ID**, **Application (client) ID** and the client secret **value** (not its ID) in `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`. In production `NEXT_PUBLIC_APP_URL` must also be set, or SSO stays off.
3. Restart the app. "Sign in with Microsoft" becomes the main button; email and password move behind "Sign in with password instead". Set `PASSWORD_SIGNIN_ENABLED=false` to remove password sign-in completely.

What happens when someone signs in with Microsoft:

- **Existing account:** if the email already exists (for example a seeded or pre-created account), the Microsoft identity is linked to it.
- **First-time user:** a new profile is created as User (`participant` + `employee_voter`), or Developer / Admin if the email is in `AD_DEVELOPER_EMAILS` / `AD_ADMIN_EMAILS`.
- **Checks:** sign-in is refused unless the user's tenant matches `MICROSOFT_TENANT_ID` and their email domain is in `ALLOWED_EMAIL_DOMAIN`.
- **Local passwords:** any AIdea password on the account is removed at the first Microsoft sign-in.
- **Name and email** are refreshed from Microsoft on every sign-in. Apart from the listed Developer / Admin emails, roles are managed in **User Management**.
- **Sign out** also signs the user out of Microsoft, so shared PCs don't stay signed in.

### Testing Active Directory sign-in on this PC

Under `npm run dev` on a domain-joined PC, `/sign-in` already uses Active Directory: without `LDAP_URL` it asks the domain controller this PC signed in through. Demo accounts aren't in AD, so for them sign-in falls back to the demo password.

To see each step of an AD sign-in, open <http://localhost:3000/ad-test>. The page only works under `npm run dev` and returns 404 in production builds.

1. **Trust the corporate CA.** Node doesn't use the Windows certificate store, so export the CA chain of the domain controller's LDAPS certificate to a PEM file. For example, use `C:\aidea\certs\corp-root-ca.pem`, which holds `godrejinds-GCRPCASRPR04-CA` and `godrejinds-GCRPINTCAAPP1-CA`. Then set `LDAP_CA_CERT_PATH=C:/aidea/certs/corp-root-ca.pem` in `.env.local`.
2. **Check connection only** needs no password. It confirms that the domain controller answers over TLS and shows the base DN.
3. **Test and sign in** needs your Windows password. The network ID is filled in from this PC. The test checks the password, reads your AD record (including department and title) and applies `ALLOWED_EMAIL_DOMAIN`. It then creates or links your AIdea account and signs you in, the same way `/sign-in` does.

**Lookup method:** until IT provides the service account (`LDAP_BIND_DN` / `LDAP_BIND_PASSWORD`), sign-in binds to AD directly as you. Once both are set, it looks you up with the service account first.

**Lockout protection:** the page stops after 3 password checks in 15 minutes, so testing can't lock your Windows account.

## 7. Run the tests

```bash
npm run test          # Vitest: unit tests, plus integration tests against real SQL (see below)
npm run test:e2e      # Playwright: needs `npm run db:reset` and `npm run dev`; see tests/e2e/ file headers
npm run typecheck
npm run lint
```

For the integration tests (`tests/integration/`), Vitest does the following:

- It creates a throwaway `aidea_test` database on the same SQL Server.
- Before each test file, it re-migrates and re-seeds that database, then runs the real service code and stored procedures against it.
- It drops `aidea_test` at the end. Set `KEEP_TEST_DB=true` to keep it for inspection.

The integration tests never touch your `aidea` dev database.

## 8. Build for production

```bash
npm run build
npm run start
```

`npm run start` serves on `localhost:3000`. Add `-- -H 0.0.0.0` to accept LAN connections, and set `SESSION_COOKIE_SECURE=false` if you serve production over plain `http://`, otherwise the sign-in cookie is never sent back.

To run it permanently on a Windows PC, see **[SELF_HOSTING_WINDOWS.md](./SELF_HOSTING_WINDOWS.md)**. For a containerized or Linux company-server deployment, see **[COMPANY_SERVER_DEPLOYMENT.md](./COMPANY_SERVER_DEPLOYMENT.md)**.

## Connecting with a SQL login instead (TCP)

Linux, Docker and remote database servers can't use Windows authentication over shared memory. Instead:

1. In SQL Server Configuration Manager, enable **TCP/IP** for the instance on port 1433 and restart the service.
2. Enable **SQL Server and Windows Authentication mode** (SSMS → server Properties → Security) and restart.
3. Create a least-privilege login for the app:

   ```sql
   CREATE LOGIN aidea_app WITH PASSWORD = '<strong password>';
   USE aidea;
   CREATE USER aidea_app FOR LOGIN aidea_app;
   ALTER ROLE db_datareader ADD MEMBER aidea_app;
   ALTER ROLE db_datawriter ADD MEMBER aidea_app;
   GRANT EXECUTE TO aidea_app;
   -- Run migrations with an account that has db_owner (or your own Windows login), not aidea_app.
   ```

4. Set `MSSQL_DRIVER=tedious`, `MSSQL_SERVER`, `MSSQL_PORT`, `MSSQL_USER` and `MSSQL_PASSWORD`.
