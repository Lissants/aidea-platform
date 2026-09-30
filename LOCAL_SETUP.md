# Local Setup

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

> **Running ad-hoc SQL with `sqlcmd`:** pass `-I` (`QUOTED_IDENTIFIER ON`), for example `sqlcmd -S . -E -C -I -d aidea -Q "..."`. The schema uses filtered indexes, and SQL Server rejects writes to those tables when `QUOTED_IDENTIFIER` is off, which is `sqlcmd`'s default. The app's ODBC and TDS connections have it on by default.

## 6. Run the app

```bash
npm run dev
```

Visit `http://localhost:3000` and sign in with a seeded demo account using email and password.

Uploaded files (showcase images and program resources) are written to `./uploads` (`UPLOAD_DIR`).

### Optional: Microsoft sign-in (Entra ID)

1. Ask IT to register a web app in Entra ID with the redirect URI `http://localhost:3000/auth/callback/microsoft`. For other environments, use `{NEXT_PUBLIC_APP_URL}/auth/callback/microsoft`.
2. Put the tenant ID, client ID and client secret in `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`.
3. Restart the app. The "Sign in with Microsoft" button appears on the sign-in page.

What happens when someone signs in with Microsoft:

- **Existing account:** if the email already exists (for example a seeded or pre-created account), the Microsoft identity is linked to it.
- **First-time user:** a new profile is created with `SSO_DEFAULT_ROLES`, which defaults to `participant,employee_voter`.
- **Checks:** sign-in is refused unless the user's tenant matches `MICROSOFT_TENANT_ID` and their email domain is in `ALLOWED_EMAIL_DOMAIN`.

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

For a containerized or company-server deployment, see **[COMPANY_SERVER_DEPLOYMENT.md](./COMPANY_SERVER_DEPLOYMENT.md)**.

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
