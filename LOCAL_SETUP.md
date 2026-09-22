# Local Setup

## 1. Prerequisites

- **Node.js 20.x** (the Docker image and CI both pin `node:20`; anything ≥20 should work).
- A **Supabase** account (free tier is fine) — [supabase.com](https://supabase.com).
- (Optional) the [Supabase CLI](https://supabase.com/docs/guides/cli) if you want local Postgres via `supabase start` instead of a cloud project.

## 2. Install dependencies

```bash
git clone <this repo>
cd aidea-platform
npm install
```

## 3. Create a Supabase project

1. In the Supabase dashboard, create a new project.
2. Go to **Project Settings → API** and note:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable key** → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose to the browser)
3. Go to **Authentication → URL Configuration** and add `http://localhost:3000/auth/callback` as a redirect URL (needed for magic-link sign-in).

### Optional: local Supabase via the CLI instead of a cloud project

```bash
supabase init      # if you haven't already
supabase start      # spins up local Postgres/Auth/Storage in Docker
```

The CLI prints a local URL/anon key/service key to use in step 5 instead of a cloud project's.

## 4. Apply the database schema

The schema lives in `supabase/migrations/*.sql`, applied in filename order (`0001_...` → `0016_...`).

**With the Supabase CLI** (recommended — also applies `supabase/seed.sql` automatically):

```bash
supabase link --project-ref <your-project-ref>   # cloud project
# or, for local dev:
supabase db reset      # applies every migration + seed.sql fresh
```

**Without the CLI** (any Postgres client against your project's connection string):

```bash
for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
psql "$DATABASE_URL" -f supabase/seed.sql
```

> Migrations `0011`, `0016` create Storage buckets (`showcase-images`, `program-resources`) via `insert into storage.buckets`. If your Postgres target doesn't have the Supabase `storage` schema (only true for a bare non-Supabase Postgres), create those two buckets manually in the dashboard instead — each migration file's header comment says exactly what to set.

## 5. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the values from step 3 (or the Supabase CLI's local output). `.env.example` documents every variable, including which are required where.

## 6. Seed demo accounts

`supabase/seed.sql` inserts demo profiles/roles/mentors/content, but Supabase Auth users can only be created through the Admin API (not plain SQL) — that's what `npm run seed` does:

```bash
npm run seed
```

This creates the demo `auth.users` rows (see the table in `README.md` for emails/password) with the same fixed UUIDs `supabase/seed.sql` expects, then prints instructions for applying `seed.sql` itself if you haven't already via `supabase db reset`.

## 7. Run the app

```bash
npm run dev
```

Visit `http://localhost:3000` and sign in with a seeded demo account.

## 8. Run the tests

```bash
npm run test         # Vitest — unit + integration, no live Supabase project needed
npm run test:e2e      # Playwright — REQUIRES a live Supabase project with npm run seed already run;
                       # see each file's header comment in tests/e2e/ for the exact data state each scenario needs
npm run typecheck
npm run lint
```

## 9. Build for production

```bash
npm run build
npm run start
```

For a containerized/company-server build instead, see **[COMPANY_SERVER_DEPLOYMENT.md](./COMPANY_SERVER_DEPLOYMENT.md)**. For Vercel, see **[VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md)**.
