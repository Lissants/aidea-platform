# Deploying to Vercel

## 1. Push to Git and import

1. `git push` this repository to GitHub/GitLab/Bitbucket.
2. In the Vercel dashboard: **Add New → Project → Import Git Repository**, select this repo. Vercel auto-detects Next.js — no build command changes are needed (`next build` is the default and respects `output: 'standalone'` in `next.config.mjs` automatically).

## 2. Environment variables

In **Project Settings → Environment Variables**, add every variable from `.env.example`, split across **Preview** and **Production** environments (use separate Supabase projects for each if you want isolated data — recommended):

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public — build-time and runtime. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public anon key — safe to expose. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Server-only — never mark as a client-exposed var. |
| `NEXT_PUBLIC_APP_URL` | Set to the Vercel-assigned domain (or your custom domain once attached). |
| `ALLOWED_EMAIL_DOMAIN` | e.g. `godrejcp.com`. |
| `EMAIL_PROVIDER`, `EMAIL_FROM` | For the email-outbox adapter (`lib/email/adapter.ts`) — dev mode just queues rows; production SMTP/Graph wiring is a documented TODO, see `SECURITY.md`. |
| `CRON_SECRET` | Required if you wire up Vercel Cron against `app/api/cron/voting-notifications` — see step 5. |
| `MICROSOFT_TENANT_ID` / `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Only if/when SSO via Microsoft is added — not required for password/magic-link auth. |

## 3. Supabase Auth redirect URLs

In the Supabase dashboard, **Authentication → URL Configuration**, add:

- `https://<your-vercel-domain>/auth/callback` (Production)
- `https://<preview-deployment-domain>/auth/callback` for each Preview URL pattern you use, or `https://*.vercel.app/auth/callback` if your Supabase project's redirect-URL matching supports wildcards.

Without this, magic-link sign-in on a deployed environment silently fails to complete the round trip.

## 4. Running migrations safely

Vercel does not run database migrations for you. Before (or immediately after) deploying a change that includes a new file under `supabase/migrations/`:

```bash
supabase link --project-ref <project-ref>
supabase db push       # applies any migration not yet recorded as applied
```

Treat this the same way you'd treat any other schema change: run it against a Preview/staging Supabase project first, confirm the app still builds and the affected pages work, then run it against Production. Every migration in this repo is written to be safely re-run (`create table if not exists`, `create policy ... ; drop policy if exists ... first`, etc.) so a partial or repeated apply is not destructive.

## 5. Preview vs. Production

- Every PR gets its own Preview deployment with its own URL — point Preview env vars at a separate (or same, if data isolation doesn't matter to you) Supabase project.
- Only the `main` (or your chosen production branch) deployment should point at the real production Supabase project and use `CRON_SECRET`-protected routes for real.
- If you use **Vercel Cron** for `app/api/cron/voting-notifications`, add a `vercel.json` cron entry pointing at that route with an hourly (or your preferred) schedule, and pass `CRON_SECRET` as the `Authorization: Bearer <secret>` header — Vercel Cron supports custom headers via project settings.

## 6. Custom domain & HTTPS

Vercel provisions and renews TLS certificates automatically once a custom domain is attached (**Project Settings → Domains**). No manual certificate work is required. Update `NEXT_PUBLIC_APP_URL` and the Supabase Auth redirect URL to the custom domain once attached, and re-deploy so the new value is baked into the build.

## 7. Verifying RLS / route protection after deploying

1. Sign in as a seeded `participant` account and confirm `/audit`, `/roles`, `/reports` etc. all redirect to `/access-denied` (enforced by `middleware.ts` and each `(admin)` layout).
2. Sign in as a seeded `admin` account and confirm those same routes load.
3. Open the Network tab and confirm no response body from `/api/admin/exports/*` is reachable while signed in as a non-admin (should 403).
4. In the Supabase SQL editor, run a quick sanity check as a non-admin role (e.g. `set role authenticated; select * from screening_decisions;` with a non-admin JWT claim) and confirm unpublished rows for someone else's idea are not returned — RLS, not the app, is the real boundary (see `SECURITY.md`).
