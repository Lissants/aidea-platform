# Company Server Deployment

Self-hosting the Next.js app on a company-managed server via Docker, behind an Nginx reverse proxy. The database is an existing **Microsoft SQL Server 2019** instance (on the Docker host or a separate DB server) — SQL Server is never bundled into this compose file. Uploaded files live on a persistent Docker volume. There are no other external services: authentication, authorization and file storage are all handled by the app itself.

## 1. Prepare SQL Server

The container uses the `tedious` driver (TCP + SQL login); Windows authentication over shared memory, as used in local development, is not available from a Linux container.

1. In SQL Server Configuration Manager, enable **TCP/IP** for the instance (port 1433) and restart the service. Allow 1433 through the DB server's firewall **from the app server only**.
2. Enable **SQL Server and Windows Authentication mode** (SSMS → server Properties → Security) and restart.
3. Create the database and a least-privilege runtime login:

   ```sql
   CREATE DATABASE aidea;
   CREATE LOGIN aidea_app WITH PASSWORD = '<strong password>';
   USE aidea;
   CREATE USER aidea_app FOR LOGIN aidea_app;
   ALTER ROLE db_datareader ADD MEMBER aidea_app;
   ALTER ROLE db_datawriter ADD MEMBER aidea_app;
   GRANT EXECUTE TO aidea_app;
   ```

4. Migrations create tables, triggers and stored procedures, so they need an account with `db_owner` on `aidea` (a separate SQL login such as `aidea_migrator`) — never grant that to `aidea_app`.

## 2. Build the image

```bash
docker build \
  --build-arg NEXT_PUBLIC_APP_URL="https://aidea.yourcompany.com" \
  -t aidea-platform:latest .
```

`NEXT_PUBLIC_APP_URL` is baked in at build time (it ends up in the client bundle) — rebuild the image if it changes. Everything else (`MSSQL_*`, `SESSION_SECRET`, `MICROSOFT_CLIENT_SECRET`, `CRON_SECRET`, …) is supplied at `docker run`/compose time, never baked in.

The `Dockerfile` is a 3-stage build (`deps` → `builder` → `runner`) producing a minimal runtime image using Next's `output: 'standalone'` — the final image contains only `node_modules`'s traced runtime subset, `.next/standalone`, and `.next/static`, running as a non-root `nextjs` user with `MSSQL_DRIVER=tedious` and `UPLOAD_DIR=/app/uploads`.

## 3. Run it

```bash
cp .env.example .env    # fill in every value (see below)
docker compose up -d --build
docker compose run --rm migrate    # first deploy, and after every upgrade
```

Required values in `.env`:

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Final `https://` domain. |
| `MSSQL_SERVER`, `MSSQL_PORT`, `MSSQL_DATABASE` | Defaults: `host.docker.internal`, `1433`, `aidea`. `host.docker.internal` reaches SQL Server on the Docker host. |
| `MSSQL_USER`, `MSSQL_PASSWORD` | The `aidea_app` login for `web`. |
| `MSSQL_ENCRYPT`, `MSSQL_TRUST_CERT` | Both default `true`. Set `MSSQL_TRUST_CERT=false` once SQL Server has a certificate the container trusts. |
| `SESSION_SECRET` | 32+ random characters. The app refuses to start in production without it. Rotating it signs everyone out. |
| `ALLOWED_EMAIL_DOMAIN` | e.g. `godrejcp.com` — applies to password and SSO sign-in. |
| `MICROSOFT_TENANT_ID` / `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Optional Entra ID SSO (all three, or none). `SSO_DEFAULT_ROLES` sets the roles for first-time SSO users (default `participant,employee_voter`). |
| `CRON_SECRET` | Required if you schedule `app/api/cron/voting-notifications`. |
| `EMAIL_PROVIDER`, `EMAIL_FROM` | Email-outbox adapter settings. |

The `migrate` service runs `scripts/migrate.ts` (`npm run db:migrate`) with the same environment as `web`, so run it with the `db_owner` login's credentials, e.g. `docker compose run --rm -e MSSQL_USER=aidea_migrator -e MSSQL_PASSWORD=... migrate`. Never run `npm run db:reset` against this database — it drops every object (it refuses in production unless forced).

Or without compose:

```bash
docker run -d --name aidea-platform -p 3000:3000 \
  -v aidea-uploads:/app/uploads \
  -e NEXT_PUBLIC_APP_URL="https://aidea.yourcompany.com" \
  -e MSSQL_SERVER="db.yourcompany.local" \
  -e MSSQL_DATABASE="aidea" \
  -e MSSQL_USER="aidea_app" \
  -e MSSQL_PASSWORD="..." \
  -e SESSION_SECRET="..." \
  -e ALLOWED_EMAIL_DOMAIN="godrejcp.com" \
  -e CRON_SECRET="..." \
  aidea-platform:latest
```

## 4. Health checks

`app/api/health` returns `{ status: 'ok' }` and is deliberately DB-free (see its own doc comment) — fast enough to poll every few seconds, and it reports whether the Next.js process is up, not whether SQL Server is reachable. The image's own `HEALTHCHECK` and `docker-compose.yml`'s `healthcheck:` block both use it. Point any external monitoring / load balancer health probe at `GET /api/health` too, and monitor SQL Server separately with your existing DB monitoring.

## 5. Nginx reverse proxy example

```nginx
server {
    listen 443 ssl http2;
    server_name aidea.yourcompany.com;

    ssl_certificate     /etc/letsencrypt/live/aidea.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aidea.yourcompany.com/privkey.pem;

    # Program resources can be up to 10 MB.
    client_max_body_size 12m;

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

## 6. TLS / domain / DNS / auth-callback checklist

- [ ] DNS `A`/`CNAME` record for `aidea.yourcompany.com` points at the server.
- [ ] TLS certificate issued (Let's Encrypt via certbot, or your company's internal CA) and auto-renewal scheduled (`certbot renew` cron, or your CA's equivalent).
- [ ] `NEXT_PUBLIC_APP_URL` set to the final `https://` domain — used to build the Microsoft SSO redirect URI and email links.
- [ ] If SSO is enabled: the Entra ID app registration has `https://aidea.yourcompany.com/auth/callback/microsoft` as a **Web** redirect URI. Without it, Microsoft rejects the sign-in with a redirect-URI mismatch.
- [ ] The `aidea_session` cookie is `Secure` in production, so the site must be served over HTTPS. Only for a plain-HTTP intranet deployment set `SESSION_COOKIE_SECURE=false`.
- [ ] Firewall allows inbound 443 (and 80 for the redirect + ACME challenge) only; the app container itself is never exposed directly to the internet, only via Nginx. SQL Server's 1433 is reachable from the app server only.

## 7. Logging & backups

- **App logs**: the Next.js server logs to stdout/stderr inside the container — collect via your platform's usual container log pipeline (`docker logs`, journald, or a log shipper like Fluent Bit/Vector pointed at the Docker log driver). This app writes no logs to the local filesystem.
- **Database backups**: use SQL Server's native backups (SQL Server Agent job, a maintenance plan, or your existing company backup tooling), e.g. `BACKUP DATABASE aidea TO DISK = '...\aidea_full.bak' WITH COMPRESSION, CHECKSUM;` nightly. If the database uses the FULL recovery model, also schedule `BACKUP LOG aidea ...` (e.g. every 15–60 minutes) so point-in-time restore is possible and the log doesn't grow unbounded; under SIMPLE recovery, full (plus optional differential) backups are enough.
- **Upload backups**: showcase images and program resources are files in the `uploads` Docker volume (`/app/uploads` in the container). Back the volume up on the same schedule as the database — the DB stores only `/api/files/...` URLs, so a DB restore without the matching files leaves broken images/links, and vice versa.

## 8. Migration & rollback procedure

1. **Back up first**: take a full `BACKUP DATABASE aidea` and a copy of the `uploads` volume.
2. Apply new migrations before (or together with) the application code that needs them: `docker compose run --rm migrate` with the `db_owner` credentials. `db/migrations/*.sql` are applied in filename order, each file in one transaction, and recorded in `dbo.schema_migrations`, so already-applied files are skipped and a failed file is rolled back cleanly.
3. Deploy the new application image (`docker compose up -d --build`).
4. **Rollback**: redeploy the previous image tag. If the release included a migration the old code can't run against, restore the pre-deployment database backup (`RESTORE DATABASE aidea FROM DISK = ... WITH REPLACE`) and, if needed, the matching `uploads` backup. There are no down-migrations; the backup taken in step 1 is the rollback path.

## 9. Uploaded files are stored on the server's disk

Showcase images (`showcase-images`) and program resource files (`program-resources`) are uploaded by admins via `POST /api/files/[bucket]` and written under `UPLOAD_DIR` (`lib/storage/local.ts`), then served by `GET /api/files/[bucket]/[...key]`: showcase images are public, program resources require a signed-in session. This has two consequences for a containerized deployment:

- `/app/uploads` **must** be a persistent volume (the compose file's `uploads` volume). Without it, every redeploy loses all uploaded files.
- The app is not horizontally scalable as-is: multiple replicas would each see a different disk. Running more than one replica requires pointing every replica's `UPLOAD_DIR` at the same shared storage (e.g. an SMB/NFS mount).
