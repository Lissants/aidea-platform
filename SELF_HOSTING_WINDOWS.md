# Self-Hosting AIdea on a Windows PC

This guide sets up the AIdea platform from scratch on a Windows machine, the same way the reference machine runs it: **SQL Server 2019 and Node.js on one Windows PC, with colleagues opening the app from their own devices by typing the PC's IP address.**

It takes about 45–60 minutes the first time, and most of that is waiting for installers. Each stage ends with a **✅ Checkpoint**. Don't move on until it passes, because almost every later problem comes from an earlier step that quietly failed.

> **Prefer containers or Linux?** See **[COMPANY_SERVER_DEPLOYMENT.md](./COMPANY_SERVER_DEPLOYMENT.md)** (Docker + Nginx). If you only want to code on your own laptop, **[LOCAL_SETUP.md](./LOCAL_SETUP.md)** is shorter.

---

## Contents

0. [What you'll end up with](#0-what-youll-end-up-with)
1. [Install the prerequisites](#1-install-the-prerequisites)
2. [Get the code](#2-get-the-code)
3. [Create the database](#3-create-the-database)
4. [Configure the environment](#4-configure-the-environment)
5. [Find your IP address and add it to the config](#5-find-your-ip-address-and-add-it-to-the-config)
6. [Build the schema and load demo data](#6-build-the-schema-and-load-demo-data)
7. [First launch](#7-first-launch)
8. [Let other devices in (Windows Firewall)](#8-let-other-devices-in-windows-firewall)
9. [Run it for real: production mode as a Windows service](#9-run-it-for-real-production-mode-as-a-windows-service)
10. [Optional extras: Microsoft sign-in and HTTPS](#10-optional-extras-microsoft-sign-in-and-https)
11. [Backups and upgrades](#11-backups-and-upgrades)
12. [Troubleshooting](#12-troubleshooting)

---

## 0. What you'll end up with

```
 Colleague's laptop / phone                     Your Windows PC
 ┌─────────────────────┐   http://<PC-IP>:3000  ┌──────────────────────────────────────┐
 │  Browser            │ ─────────────────────▶ │  Node.js  ─ AIdea (Next.js 16)        │
 └─────────────────────┘    (same network)      │     │  Windows auth, shared memory   │
                                                │     ▼                                │
                                                │  SQL Server 2019  ─ database "aidea" │
                                                │  .\uploads\  ─ images & resources    │
                                                └──────────────────────────────────────┘
```

- **One process** (Node.js) serves the whole app: pages, APIs, sign-in and file downloads.
- **One database** (`aidea` on the default SQL Server instance). The app connects with *your Windows login* through the `msnodesqlv8` driver, so there are no SQL passwords to manage.
- **One folder of uploaded files** (`.\uploads`). It holds showcase images and program resources and must be backed up along with the database.
- No cloud services. Sign-in, permissions and file storage are all handled by the app.

---

## 1. Install the prerequisites

Install these in order. Accept the defaults unless the table says otherwise.

| # | Software | Where to get it | Notes |
| --- | --- | --- | --- |
| 1 | **Git for Windows** | git-scm.com | Defaults are fine. |
| 2 | **Node.js 20.12 or newer (LTS)** | nodejs.org | Node 22 and 24 also work. Leave **"Automatically install the necessary tools"** ticked: it installs the build tools the native SQL driver may need. |
| 3 | **SQL Server 2019** (Express or Developer) | microsoft.com → SQL Server downloads | Choose the **Basic** install, or in Custom mode pick **Default instance** (`MSSQLSERVER`). Windows Authentication mode is enough. |
| 4 | **SQL Server Management Studio (SSMS)** | microsoft.com → SSMS | Optional but handy. Recent SSMS installs also bring the ODBC driver below. |
| 5 | **ODBC Driver 18 for SQL Server** | microsoft.com → "ODBC Driver 18" | Required by the `msnodesqlv8` driver. Skip it if step 4 already installed it. |
| 6 | **sqlcmd** | Comes with SQL Server / "Microsoft Command Line Utilities for SQL Server" | Used to create the database. |

Use an account with **administrator rights** on the PC. The SQL Server installer makes the installing user a `sysadmin`, which the setup needs.

**✅ Checkpoint.** Open a **new** PowerShell window and run:

```powershell
git --version
node -v                       # v20.12.0 or higher
npm -v
sqlcmd -S . -E -C -Q "SELECT @@VERSION"     # should print "Microsoft SQL Server 2019 ..."
Get-OdbcDriver -Name "ODBC Driver 18 for SQL Server" | Select-Object Name, Platform
```

All five commands should print something useful with no red errors.

---

## 2. Get the code

Pick a permanent home for the app. The examples use `C:\apps`.

```powershell
mkdir C:\apps -Force
cd C:\apps
git clone https://github.com/Lissants/aidea-platform.git
cd aidea-platform
npm install
```

`npm install` takes a few minutes. It also compiles **`msnodesqlv8`**, the Windows-only native SQL driver (it's an *optional* dependency, so it is skipped on Linux/Docker where the pure-JavaScript `tedious` driver is used instead).

**✅ Checkpoint.** `npm install` ends without `ERR!` lines, and this prints a path:

```powershell
node -e "console.log(require.resolve('msnodesqlv8'))"
```

---

## 3. Create the database

```powershell
sqlcmd -S . -E -C -Q "IF DB_ID('aidea') IS NULL CREATE DATABASE aidea"
```

The flags are `-S .` (this PC, default instance), `-E` (use my Windows login) and `-C` (trust the server's self-signed certificate).

> 💡 **Running your own SQL later?** Always add `-I` (for example `sqlcmd -S . -E -C -I -d aidea -Q "..."`). The schema uses filtered indexes, and SQL Server rejects writes to those tables unless `QUOTED_IDENTIFIER` is on, which `sqlcmd` leaves off by default. SSMS and the app turn it on automatically.

**✅ Checkpoint.**

```powershell
sqlcmd -S . -E -C -Q "SELECT name FROM sys.databases WHERE name = 'aidea'"
```

prints `aidea`.

---

## 4. Configure the environment

The app reads its settings from `.env.local` in the project folder. Start from the documented template:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Set these values (leave the rest as they are):

| Variable | Set it to | Why |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `http://<your-IP>:3000`, for example `http://192.168.1.25:3000` | Used to build sign-in redirects and links in emails. You'll find your IP in [step 5](#5-find-your-ip-address-and-add-it-to-the-config). |
| `MSSQL_DRIVER` | `msnodesqlv8` (already set) | Windows authentication over shared memory. |
| `MSSQL_SERVER` | `.` (already set) | The default instance on this PC. Use `.\SQLEXPRESS` if you installed a named Express instance. |
| `MSSQL_DATABASE` | `aidea` (already set) | |
| `SESSION_SECRET` | A random string of 48+ characters (command below) | Signs the sign-in cookie. Production mode refuses to start without it. |
| `ALLOWED_EMAIL_DOMAIN` | `godrejcp.com` | Only emails on this domain can sign in. The demo accounts use it. Leave it empty to allow any domain. |
| `UPLOAD_DIR` | `./uploads` (already set) | Where uploaded files are stored, relative to the project folder. |

Generate the secret and paste the output into `SESSION_SECRET=`:

```powershell
node -e "console.log(crypto.randomBytes(48).toString('base64url'))"
```

> 🔒 `.env.local` holds secrets. It's in `.gitignore`. Never commit it or send it by chat or email. Changing `SESSION_SECRET` later signs everybody out, which is harmless but surprising.

**✅ Checkpoint.** `.env.local` exists in the project folder, and `SESSION_SECRET=` is followed by a long random string.

---

## 5. Find your IP address and add it to the config

Other devices reach the app through your PC's **local IP address**. Every machine and network has a different one, so this step is specific to you.

### 5a. Find the IP

```powershell
ipconfig
```

Look under the adapter you're actually connected with (**Wireless LAN adapter Wi-Fi** or **Ethernet adapter Ethernet**) for the **IPv4 Address**, for example `192.168.1.25`. Ignore adapters named *vEthernet*, *VMware*, *VirtualBox*, *WSL* or *Bluetooth*.

A shorter PowerShell alternative:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object InterfaceAlias, IPAddress
```

### 5b. Put it in `next.config.mjs`

Open `next.config.mjs` and find `allowedDevOrigins`. It currently contains the IP of the machine the app was developed on:

```js
allowedDevOrigins: ['192.168.48.128'],
```

Replace it with **your** IP. You can list several addresses or host names, for example if the PC has both Wi-Fi and Ethernet, or a DNS name:

```js
allowedDevOrigins: ['192.168.1.25'],
// or
allowedDevOrigins: ['192.168.1.25', '10.0.0.14', 'aidea-pc.corp.local'],
```

Save the file and **restart** the dev server if it's running. Next.js only reads this file at startup.

**What this setting does:** in development mode (`npm run dev`), Next.js blocks its live-reload and JavaScript chunks for any origin other than `localhost` unless that origin is listed here. If your IP is missing, the page **loads but never becomes interactive**: buttons do nothing and forms don't submit. It has no effect in production mode (`npm run start`, [step 9](#9-run-it-for-real-production-mode-as-a-windows-service)), but keep it correct anyway.

### 5c. Update `NEXT_PUBLIC_APP_URL`

Back in `.env.local`, make sure `NEXT_PUBLIC_APP_URL` uses the same IP: `http://192.168.1.25:3000`.

### 5d. Keep the IP from changing (recommended)

Home and office routers hand out addresses dynamically, so your IP can change after a reboot and every bookmark breaks. Either:

- ask IT (or use your router's admin page) to create a **DHCP reservation** for this PC, or
- set a **static IP** in *Settings → Network & internet → (adapter) → IP assignment → Edit*.

If the IP does change, repeat 5b and 5c and restart the app.

**✅ Checkpoint.** `next.config.mjs` and `NEXT_PUBLIC_APP_URL` both contain the IPv4 address `ipconfig` shows for your active adapter.

---

## 6. Build the schema and load demo data

```powershell
npm run db:reset
```

This one command:

1. drops every object in the `aidea` database (it's empty right now, so nothing is lost);
2. applies `db/migrations/*.sql` in order (tables, triggers and stored procedures) and records each file in `dbo.schema_migrations`;
3. seeds a demo program, demo users, ideas, reviews and votes (`scripts/seed.ts`, then `db/seed.sql`).

> ⚠️ **`db:reset` deletes everything.** Use it only for a fresh install or a demo machine. Once real people have entered real ideas, use `npm run db:migrate` instead: it applies only new migration files and never drops data.

**✅ Checkpoint.** The command ends without errors, and

```powershell
sqlcmd -S . -E -C -d aidea -Q "SELECT COUNT(*) AS users FROM dbo.users; SELECT name FROM dbo.schema_migrations"
```

shows a non-zero user count and three migrations (`0001_schema.sql`, `0002_triggers.sql`, `0003_procedures.sql`).

---

## 7. First launch

```powershell
npm run dev -- -H 0.0.0.0
```

`-H 0.0.0.0` tells the server to listen on every network interface, not just this PC. When you see `✓ Ready`, open **http://localhost:3000** on the PC itself and sign in with a demo account:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `demo.admin1@godrejcp.com` | `AideaDemo!2026` |
| Mentor | `demo.mentor1@godrejcp.com` | `AideaDemo!2026` |
| Mentor (low capacity, for routing-overflow testing) | `demo.mentor3@godrejcp.com` | `AideaDemo!2026` |
| Participant | `demo.participant1@godrejcp.com` | `AideaDemo!2026` |
| Employee voter | `demo.voter1@godrejcp.com` | `AideaDemo!2026` |

These accounts are fake and meant only for demos and testing. Set `DEMO_PASSWORD` in `.env.local` before seeding if you want a different password.

**Take a quick tour to prove everything works:**

1. As **Participant**, open **Submit New Idea** and walk through the idea wizard:
   - **Team & Idea Information:** a team name, a **Team Leader** (required; search a colleague by name or email) and up to **5 team members**.
   - **Business impact:** primary and optional secondary impact, with what would count as a measurable result.
   - **Support needed:** optional tools, budget (IDR) or data access.
   - **Preferred mentors:** first and second choice.

   Click **Save draft** halfway through. Drafts save even with empty sections, and the full checks only run when you click **Submit idea**.
2. As **Admin**, open **Overview**, **Idea Management** and **Review Assignment** and confirm you can see the submitted idea.
3. As **Mentor**, open **Idea Dashboard** and **My Reviews**.

**✅ Checkpoint.** You can sign in, the wizard saves a draft, and the admin pages load.

---

## 8. Let other devices in (Windows Firewall)

Windows blocks incoming connections by default. Open port 3000 for your private (trusted) network. Run this in an **administrator** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "AIdea (TCP 3000)" -Direction Inbound `
  -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private,Domain
```

Then make sure Windows treats your network as **Private** or **Domain**, not Public: *Settings → Network & internet → (your network) → Network profile type → Private*.

**✅ Checkpoint.** On a phone or another laptop on the **same network**, open `http://<your-IP>:3000`. The sign-in page appears and the buttons work. If the page appears but is frozen, revisit [step 5b](#5b-put-it-in-nextconfigmjs).

---

## 9. Run it for real: production mode as a Windows service

`npm run dev` is ideal while you're testing, but it's slower, recompiles on every change and stops when you close the window. For a machine that other people depend on, switch to production mode and run it as a service that starts automatically with Windows.

### 9a. Production settings

Add this line to `.env.local`:

```ini
# Plain http:// on the LAN, so the sign-in cookie must not be HTTPS-only:
SESSION_COOKIE_SECURE=false
```

Don't put `NODE_ENV` in `.env.local`: `npm run start` sets it to `production` by itself, and forcing it there would break `npm run dev`.

> Why `SESSION_COOKIE_SECURE=false`? In production the sign-in cookie is **Secure** by default, and browsers only send Secure cookies over `https://`. Over plain `http://<IP>:3000`, you'd sign in and immediately land back on the sign-in page. Remove this line once you put HTTPS in front ([step 10](#10-optional-extras-microsoft-sign-in-and-https)).

If real users will use this machine, now is also the time to decide whether to keep the demo data. For a clean program, run `npm run db:reset` once more **before** go-live, then enable Microsoft sign-in (or create real accounts), grant the admin role to the real program owners on the **Role Management** page (`/roles`, admin only), and revoke the roles of the `demo.*` accounts there. There's no in-app "delete user". Revoking roles is how you retire an account.

### 9b. Build and test once by hand

```powershell
npm run build
npm run start -- -H 0.0.0.0 -p 3000
```

`npm run build` takes a minute or two. Next.js may warn that `"next start" does not work with "output: standalone"`. That warning is aimed at Docker images; `next start` works fine here. Open `http://<your-IP>:3000`, sign in, then stop the server with **Ctrl + C**.

### 9c. Install as a service with NSSM

[NSSM](https://nssm.cc) ("the Non-Sucking Service Manager") wraps any program as a Windows service. Download it, extract it to `C:\tools\nssm`, and in an **administrator** PowerShell run:

```powershell
$nssm = "C:\tools\nssm\win64\nssm.exe"
$app  = "C:\apps\aidea-platform"

& $nssm install AIdea "C:\Program Files\nodejs\node.exe" `
  "node_modules\next\dist\bin\next start -H 0.0.0.0 -p 3000"
& $nssm set AIdea AppDirectory $app
& $nssm set AIdea AppEnvironmentExtra NODE_ENV=production
& $nssm set AIdea Start SERVICE_AUTO_START
& $nssm set AIdea AppStdout "$app\logs\aidea.log"
& $nssm set AIdea AppStderr "$app\logs\aidea.err.log"
& $nssm set AIdea AppRotateFiles 1
& $nssm set AIdea AppRotateBytes 10485760
mkdir "$app\logs" -Force
```

**Important: who the service runs as.** The app connects to SQL Server with *the Windows account the process runs under*. A new service runs as `LocalSystem` (`NT AUTHORITY\SYSTEM`), which **does not** have access to the `aidea` database. Pick one of these:

- **Option 1 (simplest): run the service as your own account.**

  ```powershell
  & $nssm set AIdea ObjectName ".\<your-windows-username>" "<your-windows-password>"
  ```

  For a domain account, use `DOMAIN\username`. Remember to update the service if that password changes.

- **Option 2 (cleaner): give the service account its own database access.** Run this once, then leave the service as LocalSystem:

  ```powershell
  sqlcmd -S . -E -C -I -Q "CREATE LOGIN [NT AUTHORITY\SYSTEM] FROM WINDOWS; " 2>$null
  sqlcmd -S . -E -C -I -d aidea -Q "CREATE USER [NT AUTHORITY\SYSTEM] FOR LOGIN [NT AUTHORITY\SYSTEM]; ALTER ROLE db_datareader ADD MEMBER [NT AUTHORITY\SYSTEM]; ALTER ROLE db_datawriter ADD MEMBER [NT AUTHORITY\SYSTEM]; GRANT EXECUTE TO [NT AUTHORITY\SYSTEM];"
  ```

  (The login may already exist; that error is safe to ignore.) Keep running migrations from your own account, which has `db_owner` rights.

Start it:

```powershell
& $nssm start AIdea
Get-Service AIdea
```

**✅ Checkpoint.** `Get-Service AIdea` shows **Running**, `http://<your-IP>:3000/api/health` returns `{"status":"ok", ...}`, and after a reboot the app comes back by itself.

### 9d. Schedule the voting notifications (hourly)

The "voting is open" and "voting closes in 24 hours" notifications are sent by `GET /api/cron/voting-notifications`, which something has to call regularly. Set `CRON_SECRET` in `.env.local` (another random string, made with the same command as `SESSION_SECRET`), restart the service, then register an hourly Windows scheduled task in an **administrator** PowerShell:

```powershell
$secret = "<the CRON_SECRET value>"
$cmd = "Invoke-RestMethod -Uri http://localhost:3000/api/cron/voting-notifications -Headers @{ Authorization = 'Bearer $secret' }"
$action  = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command `"$cmd`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName "AIdea voting notifications" -Action $action -Trigger $trigger -User "SYSTEM"
```

Test it by running the `Invoke-RestMethod` line yourself. It answers with a small JSON summary, or `Unauthorized` if the secret doesn't match. Running it more often is harmless: each notification is sent only once.

Day-to-day commands:

| Task | Command (admin PowerShell) |
| --- | --- |
| Stop / start / restart | `nssm stop AIdea` · `nssm start AIdea` · `nssm restart AIdea` |
| See logs | `Get-Content C:\apps\aidea-platform\logs\aidea.log -Tail 50 -Wait` |
| Change settings | `nssm edit AIdea` (GUI) |
| Remove the service | `nssm remove AIdea confirm` |

---

## 10. Optional extras: Microsoft sign-in and HTTPS

### Microsoft Entra ID (single sign-on)

1. Ask IT to register a **Web** app in Entra ID with the redirect URI `{NEXT_PUBLIC_APP_URL}/auth/callback/microsoft`, for example `http://192.168.1.25:3000/auth/callback/microsoft`. Entra only accepts plain `http://` redirect URIs for `localhost`, so a LAN deployment with SSO normally needs HTTPS and a host name (next section).
2. Put `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` in `.env.local` and restart the service.
3. A **Sign in with Microsoft** button appears. First-time users get the roles in `SSO_DEFAULT_ROLES` (default `participant,employee_voter`). An admin grants mentor and admin roles in **Role Management**.

### HTTPS with IIS as a reverse proxy

To serve `https://aidea.yourcompany.local` instead of `http://IP:3000`:

1. Ask IT for a DNS name pointing at the PC and a certificate from the company CA.
2. Enable **IIS** (*Turn Windows features on or off → Internet Information Services*), then install the **URL Rewrite** and **Application Request Routing (ARR)** modules.
3. In IIS Manager, select the server node → **Application Request Routing Cache → Server Proxy Settings** → tick **Enable proxy**.
4. Create a site bound to **https / 443** with your certificate, and add a URL Rewrite **Reverse Proxy** rule to `localhost:3000`. Under the rule's server variables, allow and set `HTTP_X_FORWARDED_PROTO` to `https`.
5. Raise the request size limit to at least 12 MB (program resources can be 10 MB): *Request Filtering → Edit Feature Settings → Maximum allowed content length = 12582912*.
6. Update `.env.local`: `NEXT_PUBLIC_APP_URL=https://aidea.yourcompany.local`, **remove** `SESSION_COOKIE_SECURE=false`, then rebuild and restart (`npm run build`, `nssm restart AIdea`).
7. Close port 3000 to the network again (`Remove-NetFirewallRule -DisplayName "AIdea (TCP 3000)"`) and open 443 instead, so everyone goes through IIS.

---

## 11. Backups and upgrades

### Back up both halves together

The database stores links to uploaded files (`/api/files/...`) but not the files themselves. Restore one without the other and you get broken images.

- **Database:** nightly full backup, for example via a SQL Server Agent job (Developer edition) or Windows Task Scheduler (Express has no Agent):

  ```powershell
  sqlcmd -S . -E -C -Q "BACKUP DATABASE aidea TO DISK = 'D:\Backups\aidea_full.bak' WITH INIT, COMPRESSION, CHECKSUM"
  ```

  (`COMPRESSION` isn't supported on Express. Drop it there.)
- **Uploads:** copy the folder on the same schedule, for example `robocopy C:\apps\aidea-platform\uploads D:\Backups\aidea-uploads /MIR`.
- **Config:** keep a copy of `.env.local` somewhere safe and private.

### Upgrading to a newer version of the app

```powershell
cd C:\apps\aidea-platform
# 1. Back up first (database + uploads, see above)
git pull
npm install
npm run db:migrate          # applies only new migrations; never db:reset here
npm run build
nssm restart AIdea          # admin PowerShell
```

Check `next.config.mjs` after `git pull`. If the update overwrote `allowedDevOrigins` with someone else's IP, put yours back (this only matters for `npm run dev`).

**Rolling back:** `git checkout <previous-commit>`, `npm install`, `npm run build`, restart. If the release included a migration the old code can't handle, restore the database backup you took first (`RESTORE DATABASE aidea FROM DISK = '...' WITH REPLACE`). There are no "down" migrations.

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Data source name not found and no default driver specified` | ODBC Driver 18 missing, or a different version installed | Install ODBC Driver 18, or set `MSSQL_ODBC_DRIVER=ODBC Driver 17 for SQL Server` in `.env.local`. |
| `Login failed for user 'NT AUTHORITY\SYSTEM'` (service only) | The service account has no database access | See [9c](#9c-install-as-a-service-with-nssm): run the service as your account or grant the login. |
| `Login failed for user '<you>'` / `Cannot open database "aidea"` | Database not created, or wrong instance | Re-run [step 3](#3-create-the-database). For a named instance, set `MSSQL_SERVER=.\SQLEXPRESS`. |
| `INSERT failed because ... QUOTED_IDENTIFIER` when running SQL by hand | `sqlcmd` defaults to `QUOTED_IDENTIFIER OFF` | Add `-I` to your `sqlcmd` command. |
| Page loads but buttons do nothing (dev mode, from another device) | Your IP isn't in `allowedDevOrigins` | [Step 5b](#5b-put-it-in-nextconfigmjs), then restart `npm run dev`. |
| Works on the PC, unreachable from other devices | Firewall, Public network profile, or server bound to localhost | [Step 8](#8-let-other-devices-in-windows-firewall). Start with `-H 0.0.0.0`. |
| Sign-in "succeeds" but you land back on the sign-in page (production over http) | Secure cookie over plain HTTP | Set `SESSION_COOKIE_SECURE=false` ([9a](#9a-production-settings)) or use HTTPS. |
| `SESSION_SECRET must be set (at least 32 characters) in production.` | Missing or short secret | Generate one ([step 4](#4-configure-the-environment)). |
| `Refusing to reset in production` | `db:reset` with `NODE_ENV=production` | Intentional. Use `npm run db:migrate`. Only pass `--force` if you truly want to wipe the database. |
| `EADDRINUSE: address already in use :::3000` | Something else (often a forgotten dev server or the service) is on port 3000 | `Get-NetTCPConnection -LocalPort 3000` to find it, stop it, or use `-p 3001` (and update the firewall rule and `NEXT_PUBLIC_APP_URL`). |
| `npm install` fails building `msnodesqlv8` | Missing C++ build tools | Re-run the Node.js installer with "necessary tools" ticked, or install *Visual Studio Build Tools* (Desktop development with C++). |
| Bookmarks stopped working after a reboot | The PC's IP changed | [Step 5d](#5d-keep-the-ip-from-changing-recommended). |
| "Email sent" but nothing arrives | Expected: emails are queued in `email_outbox`, not delivered | See "Deferred / stubbed work" in [ASSUMPTIONS.md](./ASSUMPTIONS.md). |

Still stuck? `GET /api/health` tells you whether the Node process is up (it never touches the database). Then check `logs\aidea.err.log`, or the terminal in dev mode, for the first red error. It's almost always more telling than the last one.
