# Company Server Deployment

Self-hosting the Next.js app on a company-managed server via Docker, behind an Nginx reverse proxy. Supabase (Postgres + Auth + Storage) is still a separate service — cloud Supabase or a self-managed Supabase stack — never bundled Postgres in this compose file. See the last section for what changes if you later self-host Supabase/Postgres too.

## 1. Build the image

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://<project>.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<anon-key>" \
  --build-arg NEXT_PUBLIC_APP_URL="https://aidea.yourcompany.com" \
  -t aidea-platform:latest .
```

`NEXT_PUBLIC_*` vars are baked in at build time (they end up in the client bundle) — rebuild the image if any of them change. Everything else (secrets) is supplied at `docker run`/compose time, never baked in.

The `Dockerfile` is a 3-stage build (`deps` → `builder` → `runner`) producing a minimal runtime image using Next's `output: 'standalone'` — the final image contains only `node_modules`'s traced runtime subset, `.next/standalone`, and `.next/static`, running as a non-root `nextjs` user.

## 2. Run it

```bash
cp .env.example .env    # fill in every value
docker compose up -d --build
```

Or without compose:

```bash
docker run -d --name aidea-platform -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL="..." \
  -e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="..." \
  -e SUPABASE_SERVICE_ROLE_KEY="..." \
  -e NEXT_PUBLIC_APP_URL="https://aidea.yourcompany.com" \
  -e ALLOWED_EMAIL_DOMAIN="godrejcp.com" \
  -e CRON_SECRET="..." \
  aidea-platform:latest
```

## 3. Health checks

`app/api/health` returns `{ status: 'ok' }` and is deliberately DB-free (see its own doc comment) — fast enough to poll every few seconds. The image's own `HEALTHCHECK` and `docker-compose.yml`'s `healthcheck:` block both use it. Point any external monitoring / load balancer health probe at `GET /api/health` too.

## 4. Nginx reverse proxy example

```nginx
server {
    listen 443 ssl http2;
    server_name aidea.yourcompany.com;

    ssl_certificate     /etc/letsencrypt/live/aidea.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aidea.yourcompany.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name aidea.yourcompany.com;
    return 301 https://$host$request_uri;
}
```

## 5. TLS / domain / DNS / auth-callback checklist

- [ ] DNS `A`/`CNAME` record for `aidea.yourcompany.com` points at the server.
- [ ] TLS certificate issued (Let's Encrypt via certbot, or your company's internal CA) and auto-renewal scheduled (`certbot renew` cron, or your CA's equivalent).
- [ ] `NEXT_PUBLIC_APP_URL` set to the final `https://` domain — used for magic-link and OAuth redirect construction.
- [ ] Supabase dashboard → **Authentication → URL Configuration** → add `https://aidea.yourcompany.com/auth/callback` as an allowed redirect URL. Without this, magic-link sign-in silently fails to complete.
- [ ] Firewall allows inbound 443 (and 80 for the redirect + ACME challenge) only; the app container itself is never exposed directly to the internet, only via Nginx.

## 6. Logging & backups

- **App logs**: the Next.js server logs to stdout/stderr inside the container — collect via your platform's usual container log pipeline (`docker logs`, journald, or a log shipper like Fluent Bit/Vector pointed at the Docker log driver). This app writes no logs to the local filesystem.
- **Database backups**: Supabase Cloud projects include automatic daily backups (Point-in-Time Recovery on paid tiers) — configure retention in the Supabase dashboard. For a self-managed Supabase/Postgres stack, schedule `pg_dump` (or your existing company backup tooling) against the Postgres instance directly; this app has no bespoke backup mechanism of its own since all durable state lives in Postgres/Storage, not on the app server.
- **Storage backups**: `showcase-images` and `program-resources` buckets — Supabase Storage on the cloud tier is backed by object storage with its own durability guarantees; for self-managed Supabase Storage (backed by S3-compatible storage), back that bucket up the same way you'd back up any other object storage.

## 7. Migration & rollback procedure

1. Before deploying application code that depends on a new migration, apply the migration first against the target Supabase project: `supabase db push` (or `psql -f` each new file — see `LOCAL_SETUP.md` step 4). Every migration here is additive/idempotent (`create table if not exists`, `create policy` guarded by `drop policy if exists`) specifically so this is safe to re-run.
2. Deploy the new application image.
3. **Rollback**: redeploy the previous image tag (`docker compose up -d --build` with the prior image, or `docker run` the prior tag). Since migrations are additive and no migration in this repo drops a column/table other tables still depend on, rolling back the app code while a new migration is already applied is safe — the old code simply doesn't use the new columns/tables yet. If a migration ever needs a genuine breaking rollback, write and commit an explicit down-migration file at that time; none of the current migrations require one.

## 8. No reliance on the local filesystem for uploads

Showcase images (`showcase-images` bucket) and program resource files (`program-resources` bucket) are uploaded directly from the browser to **Supabase Storage**, never written to the app container's local disk (see `components/admin/showcase-image-upload.tsx` and `components/admin/program-resources-panel.tsx`). This matters specifically for a containerized deployment: the app container is disposable and horizontally scalable — restarting, redeploying, or running multiple replicas never loses or fragments uploaded files, because none of them ever lived on the container's filesystem in the first place.

## 9. If you later self-host Supabase/Postgres entirely

Everything above assumes Supabase Cloud (or an already-running self-managed Supabase stack) as a given. If your company later moves to fully self-hosting Supabase's own Docker stack (Postgres + GoTrue + PostgREST + Storage + Realtime) alongside this app:

- Run the Supabase stack as its own set of services/compose file (Supabase publishes an official `docker-compose.yml` for self-hosting) — **do not** merge it into this repo's `docker-compose.yml`; keep the app and the data platform independently deployable and independently backed up.
- Point this app's `NEXT_PUBLIC_SUPABASE_URL` at your self-hosted Kong/API gateway URL instead of `*.supabase.co`.
- You become responsible for everything Supabase Cloud otherwise manages for you: Postgres backups/PITR, connection pooling (PgBouncer), GoTrue SMTP configuration for magic-link emails, Storage backend (S3-compatible object storage, not local disk, for the same reason as section 8), and security patching of every one of those services.
- RLS policies, migrations, and this app's code do not change at all — RLS is enforced by Postgres itself, not by anything Supabase-Cloud-specific.
