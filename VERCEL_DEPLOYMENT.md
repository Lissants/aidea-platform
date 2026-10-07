# Deploying to Vercel

> **Obsolete — Vercel is not a supported deployment target.** Since the move from Supabase to an on-premises Microsoft SQL Server 2019 database, the app cannot run on Vercel:
>
> - **Database**: Vercel's serverless functions run on the public internet and cannot reach a SQL Server instance inside the company network (and the database must not be exposed to the internet to make that possible).
> - **File uploads**: program resources are stored on local disk under `UPLOAD_DIR`. Vercel functions have no persistent disk, so every upload would be lost.
>
> Deploy on a company server with Docker instead — see **[COMPANY_SERVER_DEPLOYMENT.md](./COMPANY_SERVER_DEPLOYMENT.md)**. The notes below are kept only for the parts that still apply if a future version adds a reachable database and object storage.

## 1. Push to Git and import

1. `git push` this repository to GitHub/GitLab/Bitbucket.
2. In the Vercel dashboard: **Add New → Project → Import Git Repository**, select this repo. Vercel auto-detects Next.js — no build command changes are needed.

## 2. Environment variables

Every variable is documented in `.env.example`. `SESSION_SECRET`, `MSSQL_PASSWORD`, `MICROSOFT_CLIENT_SECRET` and `CRON_SECRET` are secrets and must never be marked as client-exposed; only `NEXT_PUBLIC_APP_URL` is public. If Microsoft SSO is enabled, add `https://<your-domain>/auth/callback/microsoft` as a redirect URI in the Entra ID app registration.

## 3. Cron

If you use **Vercel Cron** for `app/api/cron/voting-notifications`, add a `vercel.json` cron entry pointing at that route with an hourly (or your preferred) schedule, and pass `CRON_SECRET` as the `Authorization: Bearer <secret>` header.

## 4. Migrations

Vercel does not run database migrations. Run `npm run db:migrate` against the target database with a `db_owner` account before deploying code that depends on a new file under `db/migrations/`.

## 5. Verifying route protection after deploying

1. Sign in as a seeded `participant` account and confirm `/audit`, `/roles`, `/reports` etc. all redirect to `/access-denied` (enforced by `proxy.ts` and each `(admin)` layout).
2. Sign in as a seeded `admin` account and confirm those same routes load.
3. Open the Network tab and confirm no response body from `/api/admin/exports/*` is reachable while signed in as a non-admin (should 403).
