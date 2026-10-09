# AIdea on a local IIS (HttpPlatformHandler)

IIS starts and stops Node itself, and restarts it together with the app pool. There is no separate Windows service.

For the production server (IIS reverse proxy, HTTPS, NSSM), see [IIS_DEPLOYMENT.md](../../IIS_DEPLOYMENT.md) instead.

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
