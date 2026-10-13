# AIdea on IIS (HttpPlatformHandler)

IIS starts and stops Node itself, and restarts it together with the app pool. There is no separate Windows service.

- **This PC** (`http://localhost:8080`): `install-local.ps1`, below.
- **The production server** (`https://aidea.godrejindonesia.com`): `deploy-production.ps1`, see [Production](#production). What to ask IT for, and encryption at rest, are in [IIS_DEPLOYMENT.md](../../IIS_DEPLOYMENT.md).

Both share `common.ps1`, and both use the package from `build-package.ps1` (`npm run build:iis`).

| | |
| --- | --- |
| URL | `http://localhost:8080` (only this PC; the firewall blocks port 8080 from outside) |
| Site folder | `C:\inetpub\aidea` |
| App settings | `C:\inetpub\aidea\.env.production.local` |
| IIS settings | `C:\inetpub\aidea\web.config`, or IIS's own configuration if IIS refuses it (see below) |
| Backups | `C:\aidea\backups\<time>` and `C:\Windows\System32\inetsrv\backup\aidea-<time>`, made by every install |
| Uploads | `C:\aidea\uploads` (shared with `npm run dev`, because both use the same database) |
| Logs | `C:\inetpub\aidea\logs\node_*.log` |
| Runs as | `IIS AppPool\AIdea`, with its own SQL Server login (Windows authentication) |

## One-time prerequisites

1. **IIS** must be enabled in *Windows Features*.
2. **HttpPlatformHandler v1.2 (x64)** from Microsoft: <https://www.iis.net/downloads/microsoft/httpplatformhandler>.
3. **Node.js 24** installed for all users in `C:\Program Files\nodejs`. The app pool can't read a per-user install such as nvm.
4. **ODBC Driver 18 for SQL Server**, which `npm run dev` already needs.
5. **An AD domain controller reachable over LDAPS**, plus the corporate root CA at `LDAP_CA_CERT_PATH`. A production build signs people in only with their Windows account. There are no local passwords.

## Install or update

```powershell
# 1. Compile. No admin needed; npm run dev can keep running.
npm run build:iis

# 2. Deploy, from any prompt in the project folder. It asks for administrator rights itself (UAC).
#    -LdapUrl is needed only the first time.
deploy\iis\install-local.cmd -LdapUrl ldaps://<domain controller>:636
```

`build:iis` puts the compiled app in `dist\iis\aidea`. Add `-- -Zip` to get a zip of it as well. The package contains no settings or secrets.

`install-local.cmd` runs `install-local.ps1`. If the prompt isn't elevated, the script starts an elevated copy of itself and then shows that copy's output in your window. The output is also saved to `dist\iis\install-<time>.log`. You can still run `powershell -ExecutionPolicy Bypass -File deploy\iis\install-local.ps1` from an elevated prompt.

The install is safe to run again for every update. It does the following:
- backs up the IIS configuration and the site folder first (below);
- stops the app pool and mirrors the package into the site folder;
- creates the site, the app pool (No Managed Code, always running) and its permissions;
- writes the site's IIS settings (below);
- grants `IIS AppPool\AIdea` read/write access to the database;
- checks `/api/health`.

### Backups

Every install starts with two backups (`-NoBackup` skips them). The script prints both, with their restore commands:

| What | Where | Restore (elevated PowerShell) |
| --- | --- | --- |
| All IIS configuration | `C:\Windows\System32\inetsrv\backup\aidea-<time>` | `Restore-WebConfiguration -Name aidea-<time>` (resets every IIS site to that moment) |
| The site folder, including `.env.production.local` (logs and cache excluded) | `C:\aidea\backups\<time>\site` | `robocopy C:\aidea\backups\<time>\site C:\inetpub\aidea /MIR /COPY:DATS /XD C:\inetpub\aidea\logs C:\inetpub\aidea\.next\cache` |

Stop the site before restoring the folder (`Stop-WebAppPool AIdea`), and start it again afterwards.

On the **first** run it also writes `.env.production.local` from your `.env.local`. It replaces `NEXT_PUBLIC_APP_URL`, `UPLOAD_DIR` and `LDAP_URL` with the IIS values and keeps everything else, including the same `SESSION_SECRET`: cookies on `localhost` are shared across ports, so different secrets would sign you out of one app whenever you sign in to the other. Later runs leave that file alone. Edit it there and run `Restart-WebAppPool AIdea`.

### Where the IIS settings live

The site's IIS settings are always the same:
- the HttpPlatformHandler mapping;
- `node.exe` and `server.js`;
- `PORT=%HTTP_PLATFORM_PORT%`, `HOSTNAME=127.0.0.1` and `NODE_ENV=production`;
- the 30 MB upload limit and the hidden `Server` header.

`-IisConfig` chooses where they are written:

- **`WebConfig`** (default): a `web.config` in the site folder.
  - IIS locks the `<handlers>` section against `web.config` files by default. So the install first unlocks `<handlers>` and `<httpPlatform>` for the AIdea site only.
  - If IIS still refuses the file (HTTP 500.19), the install switches to `AppHost` on its own so the site keeps running. It then prints IIS's reason: the error code, the config error and the refused lines.
- **`AppHost`**: IIS's own configuration (`applicationHost.config`, under `<location path="AIdea">`). Section locks only apply to `web.config` files, so this always works. The site then has no `web.config`.

The last lines of the install say which one is in use. To see the settings in `AppHost` mode: IIS Manager → **AIdea** → **Configuration Editor** → `system.webServer/httpPlatform`. Every install rewrites them, so change them in `install-local.ps1`, not by hand.

Database migrations are not part of the install. Run `npm run db:migrate` from the project as before.

`NEXT_PUBLIC_APP_URL` is built into the compiled app. To change the port or address, rebuild with `npm run build:iis -- -AppUrl http://localhost:<port>` and install with `-Port <port>`.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| **HTTP Error 502.3 / 502.5** | Node did not start or crashed. Read the newest `logs\node_*.log`. |
| **HTTP Error 500.19, 0x80070021** ("section is locked") | IIS refuses a section in `C:\inetpub\aidea\web.config`. Run the install again: it unlocks the section, or switches to `-IisConfig AppHost` and tells you which section was refused. |
| **HTTP Error 500.19, other codes** | HttpPlatformHandler is missing, or the site folder isn't readable by `IIS AppPool\AIdea`. |
| **"Cannot open database" / login failed for `IIS APPPOOL\AIdea`** | Run the install again: it creates the SQL login. |
| **Sign-in says AD is unavailable** | Look for `[auth]` in the log. `LDAP_URL` must be `ldaps://` with the DC's host name, and the CA file must be readable. |
| **Images or uploads fail** | `.next\cache` and `C:\aidea\uploads` must be writable by `IIS AppPool\AIdea`. The install sets this. |

Two `[security]` lines at startup are expected on this local setup: plain `http://` and `MSSQL_TRUST_CERT=true`.

Day-to-day (elevated PowerShell): `Restart-WebAppPool AIdea`, `Stop-Website AIdea`, `Start-Website AIdea`.

## Production

One command on the server deploys, updates or rolls back AIdea. It needs nothing from the internet and no npm: the zip carries the compiled app, the database migrations and their runner (`tools\migrate.cjs`).

### Server prerequisites (once)

| | |
| --- | --- |
| Windows Server with IIS | The script installs the IIS role, *HTTP Redirection* and the IIS scripting tools if they're missing. |
| HttpPlatformHandler v1.2 (x64) | <https://www.iis.net/downloads/microsoft/httpplatformhandler> |
| Node.js 24 (x64 MSI) | Installed for all users in `C:\Program Files\nodejs`. |
| ODBC Driver 18 for SQL Server (x64) | The app's SQL Server driver. |
| The TLS certificate for `aidea.godrejindonesia.com` | Imported with its private key into *Local Computer → Personal*. The script finds it by name. |
| The corporate root CA in PEM | For example `C:\aidea\certs\corp-root-ca.pem` (`LDAP_CA_CERT_PATH`). |
| DNS, firewall, SQL Server certificate | See *What to ask IT for* in [IIS_DEPLOYMENT.md](../../IIS_DEPLOYMENT.md). |
| SQL Server database `aidea` | Created by a DBA. Whoever runs the deployment needs `db_owner` on it, because the script applies migrations (or pass `-MigrationLogin`). |

### Build (on a developer PC)

```powershell
npm run build:iis -- -AppUrl https://aidea.godrejindonesia.com -Zip
```

Copy `dist\iis\aidea-iis-<time>.zip` and the `deploy\iis` folder to the server, e.g. to `D:\drop`. The zip holds no settings or secrets.

### First deployment

1. Copy `production.env.example` to e.g. `D:\drop\aidea.env` and fill it in. Leave `SESSION_SECRET` and `CRON_SECRET` empty: the script generates them.
2. Run, from any prompt (it asks for administrator rights itself):

   ```bat
   D:\drop\deploy\iis\deploy-production.cmd -Package D:\drop\aidea-iis-<time>.zip -EnvFile D:\drop\aidea.env
   ```

3. Delete `D:\drop\aidea.env`. The copy in use is `C:\inetpub\aidea\.env.production.local`, readable by administrators and the app pool only.
4. If SQL Server is on another machine and `MSSQL_USER` is empty, the output prints the T-SQL a DBA runs once, so the server's computer account can use the database.
5. Sign in with an account in `AD_ADMIN_EMAILS` and open **Settings**: it should say AD sign-in is configured.

### Updates

#### From your PC in one step

```powershell
npm run publish:prod
```

`publish-to-server.ps1` runs the typecheck and unit tests, builds the package for `https://aidea.godrejindonesia.com`, and copies it with this folder to `\\10.21.10.189\C$\aidea\drop` (asking for a server administrator account if your own login can't open the share). It keeps the newest 3 zips there. It does not deploy: Remote Desktop to the server and double-click `C:\aidea\drop\DEPLOY-LATEST.cmd`, which runs `deploy-production.cmd -Package <that zip>`. Options: `-SkipChecks`, `-SkipBuild` (reuse the newest zip), `-Force` (don't stop for uncommitted changes), `-Server`, `-DropDir`.

#### By hand

```bat
deploy-production.cmd -Package D:\drop\aidea-iis-<time>.zip
```

The site is down from the moment it stops until Node has started again, usually under a minute.

What each run does, in order:

1. **Checks the server** (prerequisites above, the certificate's name, expiry and private key) and that the zip was built for `https://<HostName>`.
2. **Unpacks** the zip to `C:\aidea\releases\<build time>-<commit>`. The newest 5 releases are kept (`-KeepReleases`).
3. **Checks the settings**, and refuses development values (`DEMO_PASSWORD`, `DEV_ALLOWED_ORIGINS`, `SESSION_COOKIE_SECURE=false`), `ldap://`, a short `SESSION_SECRET` or an empty `ALLOWED_EMAIL_DOMAIN`.
4. **Backs up** the IIS configuration and the site folder (as in [Backups](#backups)).
5. **Stops the site and migrates.** Only when migrations are pending: a `COPY_ONLY` backup of the database goes to SQL Server's default backup folder (`-DbBackupDir` to choose another; the path is on the SQL Server machine), then the migrations run as you (Windows authentication) or as `-MigrationLogin`. If one fails, nothing is deployed and the previous version starts again.
6. **Copies** the release into `C:\inetpub\aidea`, keeping `logs`, `.next\cache` and the settings file, and sets folder permissions for `IIS AppPool\AIdea`.
7. **Configures IIS**: the `AIdea` site with one binding, `https` on 443 for the host name (SNI) with the certificate, and the HttpPlatformHandler settings (web.config, falling back to applicationHost.config as for the local install). A second, empty site `AIdea-Redirect` answers `http://` on port 80 and redirects to `https://` with the same path (301).
8. **Schedules** the hourly `AIdea voting notifications` task (as SYSTEM). It reads `CRON_SECRET` from the settings file each time.
9. **Starts and checks**: `/api/health`, the `Strict-Transport-Security` and `X-Frame-Options: DENY` headers, the http→https redirect, that Node listens on `127.0.0.1` only, and any `[security]` or `[auth]` lines in the app log. A failed check ends with exit code 1 and the rollback command.

Everything is written to `C:\aidea\deploy-logs\deploy-<time>.log`.

### Rollback

```bat
deploy-production.cmd -Rollback
```

Puts back the release built before the current one, without migrations. Run it again to go back further. **The database is not rolled back.** If a migration must be undone, restore the `aidea-predeploy-<time>.bak` printed by that deployment (on the SQL Server machine).

### Options

| Option | Default | |
| --- | --- | --- |
| `-HostName` | `aidea.godrejindonesia.com` | Must match the package's `-AppUrl`. |
| `-CertThumbprint` | newest valid certificate for the host name | |
| `-SiteName` / `-SitePath` | `AIdea` / `C:\inetpub\aidea` | |
| `-DataRoot` | `C:\aidea` | Releases, backups, deployment logs, the task script, default uploads. |
| `-IisConfig` | `WebConfig` | `AppHost` to keep IIS settings out of the site folder. |
| `-SkipMigrations`, `-SkipDbBackup`, `-DbBackupDir`, `-MigrationLogin` | | Database step. |
| `-NoBackup` | | Skips the IIS and site-folder backups. |

### Production troubleshooting

| Symptom | Check |
| --- | --- |
| *No certificate for … in Local Computer > Personal* | Import the `.pfx` (with private key) into the computer's store, not your user's, or pass `-CertThumbprint`. |
| *Could not read the migration state* | The deploying account can't reach or log in to SQL Server. Check `MSSQL_SERVER`, the SQL Server certificate (or `MSSQL_TRUST_CERT=true` until it's in place) and that you have `db_owner`. |
| *This server does not trust the certificate* | Only a note. Make sure users' browsers show no warning. |
| Login failed for `<DOMAIN>\<SERVER>$` | The DBA hasn't run the printed T-SQL yet. |
| Anything else | The newest `C:\inetpub\aidea\logs\node_*.log`, and the deployment log. |
