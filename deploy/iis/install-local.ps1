<#
.SYNOPSIS
  Installs or updates AIdea as a local IIS site run by HttpPlatformHandler.

.DESCRIPTION
  Run after `npm run build:iis`, from any prompt: the script asks for
  administrator rights itself (UAC) and shows its output in the window it was
  started from. Safe to re-run for every update.

  Each run:
    - backs up the IIS configuration and the site folder (unless -NoBackup);
    - stops the app pool and mirrors dist\iis\aidea into -SitePath, keeping
      logs, .next\cache and .env.production.local;
    - writes the site's IIS settings: a web.config in the site folder
      (-IisConfig WebConfig, the default) or applicationHost.config
      (-IisConfig AppHost). If IIS refuses the web.config (HTTP 500.19), it
      switches to applicationHost.config so the site keeps running, and says why;
    - gives IIS AppPool\<SiteName> its folder permissions and a SQL Server login;
    - starts the site and checks /api/health.

  The first run also writes .env.production.local from -EnvSource (.env.local
  by default) with the IIS overrides.

.EXAMPLE
  deploy\iis\install-local.cmd -LdapUrl ldaps://dc01.corp.example.com:636
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\iis\install-local.ps1 -IisConfig AppHost
#>
[CmdletBinding()]
param(
  [string]$SiteName = 'AIdea',
  [int]$Port = 8080,
  [string]$SitePath = 'C:\inetpub\aidea',
  [string]$UploadDir = 'C:\aidea\uploads',
  # Required on the first install: a production build signs in through AD over LDAPS only.
  [string]$LdapUrl,
  [string]$EnvSource,
  [string]$Package,
  # Where IIS reads the site's settings from (see deploy/iis/README.md).
  [ValidateSet('WebConfig', 'AppHost')]
  [string]$IisConfig = 'WebConfig',
  [string]$BackupRoot = 'C:\aidea\backups',
  [switch]$NoBackup,
  # Set by the script itself when it re-launches elevated.
  [string]$TranscriptPath
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

. (Join-Path $PSScriptRoot 'common.ps1')

# --- Elevation ---------------------------------------------------------------

Invoke-SelfElevation -BoundParameters $PSBoundParameters -ScriptPath $PSCommandPath `
  -LogDir (Join-Path $root 'dist\iis') -LogPrefix 'install'

if ($TranscriptPath) { Start-Transcript -Path $TranscriptPath | Out-Null }
trap {
  Write-Host "`nERROR: $_" -ForegroundColor Red
  if ($TranscriptPath) { Stop-Transcript | Out-Null }
  exit 1
}

if (-not $Package) { $Package = Join-Path $root 'dist\iis\aidea' }
if (-not $EnvSource) { $EnvSource = Join-Path $root '.env.local' }
$appUrl = "http://localhost:$Port"
$identity = "IIS AppPool\$SiteName"
$envFile = Join-Path $SitePath '.env.production.local'
$serverJs = Join-Path $SitePath 'server.js'
$webConfigPath = Join-Path $SitePath 'web.config'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

# --- Preflight ---------------------------------------------------------------

if (-not (Test-Path (Join-Path $env:windir 'System32\inetsrv\httpPlatformHandler.dll'))) {
  throw 'HttpPlatformHandler is not installed. Install "HttpPlatformHandler v1.2" (x64) from https://www.iis.net/downloads/microsoft/httpplatformhandler, then run this again.'
}
if (-not (Test-Path (Join-Path $Package 'server.js'))) {
  throw "No package at $Package. Run npm run build:iis first."
}
$buildInfo = Get-Content (Join-Path $Package 'build-info.json') -Raw | ConvertFrom-Json
if ($buildInfo.appUrl -ne $appUrl) {
  throw "The package was built for $($buildInfo.appUrl), but this site will be $appUrl. Rebuild with: npm run build:iis -- -AppUrl $appUrl"
}
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
if ($nodeExe -like "$env:SystemDrive\Users\*") {
  throw "node.exe is under a user profile ($nodeExe), which the app pool cannot read. Install Node.js for all users (C:\Program Files\nodejs)."
}

Import-Module WebAdministration

$otherSite = Get-WebBinding -Protocol http | Where-Object {
  $_.bindingInformation -match ":$Port`:" -and $_.ItemXPath -notmatch "@name='$SiteName'"
}
if ($otherSite) { throw "Another IIS site already uses port $Port ($($otherSite.ItemXPath))." }

# --- Backup ------------------------------------------------------------------

if (-not $NoBackup) {
  Write-Step 'Backup'
  Backup-AIdeaSite -SiteName $SiteName -SitePath $SitePath -BackupRoot $BackupRoot -Stamp $stamp
}

# --- App pool ----------------------------------------------------------------

Write-Step "App pool $SiteName"
Set-AIdeaAppPool $SiteName
Stop-SitePool $SiteName $serverJs

# --- Files -------------------------------------------------------------------

Write-Step "Copying $Package to $SitePath"
Copy-AIdeaPackage $Package $SitePath

# --- Settings ----------------------------------------------------------------

if (-not (Test-Path $envFile)) {
  Write-Step "Writing $envFile from $EnvSource"
  if (-not $LdapUrl) { throw '-LdapUrl is required the first time: a production build signs in only through AD over ldaps://.' }
  if ($LdapUrl -notmatch '^ldaps://') { throw '-LdapUrl must start with ldaps://' }
  if (-not (Test-Path $EnvSource)) { throw "No settings file at $EnvSource." }

  # IIS-specific values replace these; the rest (database, SESSION_SECRET,
  # roles, CA path) is copied as is. Keeping SESSION_SECRET identical to dev
  # matters: cookies on localhost are shared across ports.
  $replaced = 'NEXT_PUBLIC_APP_URL', 'UPLOAD_DIR', 'LDAP_URL', 'DEV_ALLOWED_ORIGINS', 'DEMO_PASSWORD', 'NODE_ENV', 'PORT', 'HOSTNAME'
  $lines = Get-Content $EnvSource | Where-Object {
    -not ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=' -and $replaced -contains $Matches[1])
  }
  $content = @(
    "# AIdea on local IIS. Generated by deploy/iis/install-local.ps1 from $EnvSource on $((Get-Date).ToString('s')).",
    "# Kept across updates. After editing, run: Restart-WebAppPool $SiteName"
  ) + $lines + @(
    '',
    '# --- IIS overrides ---',
    "NEXT_PUBLIC_APP_URL=$appUrl",
    "UPLOAD_DIR=$UploadDir",
    "LDAP_URL=$LdapUrl"
  )
  [IO.File]::WriteAllLines($envFile, [string[]]$content, (New-Object Text.UTF8Encoding $false))
} elseif ($LdapUrl) {
  Write-Warning "$envFile already exists, so -LdapUrl was ignored. Edit LDAP_URL there to change it."
}
$settings = Read-EnvFile $envFile

# --- Folders and permissions -------------------------------------------------

Write-Step "Permissions for $identity"
$logsDir = Join-Path $SitePath 'logs'
$cacheDir = Join-Path $SitePath '.next\cache'
foreach ($dir in $logsDir, $cacheDir, $UploadDir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

# Files uploaded under `npm run dev` live in the project's uploads folder; copy
# any that are missing, since both apps share the same database.
$projectUploads = Join-Path $root 'uploads'
if ((Test-Path $projectUploads) -and ((Resolve-Path $projectUploads).Path -ne (Resolve-Path $UploadDir).Path)) {
  Invoke-Native { robocopy $projectUploads $UploadDir /E /XC /XN /XO /NFL /NDL /NJH /NJS /NP } -MaxExitCode 7
}

Invoke-Native { icacls $SitePath /grant "${identity}:(OI)(CI)RX" /Q }
foreach ($dir in $logsDir, $cacheDir, $UploadDir) {
  Invoke-Native { icacls $dir /grant "${identity}:(OI)(CI)M" /Q }
}
# The settings file holds SESSION_SECRET: administrators, SYSTEM and the app pool only.
Invoke-Native { icacls $envFile /inheritance:r /grant:r '*S-1-5-32-544:(F)' '*S-1-5-18:(F)' "${identity}:(R)" /Q }
if ($settings['LDAP_CA_CERT_PATH']) {
  if (Test-Path $settings['LDAP_CA_CERT_PATH']) {
    Invoke-Native { icacls $settings['LDAP_CA_CERT_PATH'] /grant "${identity}:(R)" /Q }
  } else {
    Write-Warning "LDAP_CA_CERT_PATH points to a missing file: $($settings['LDAP_CA_CERT_PATH'])"
  }
}

# --- Site --------------------------------------------------------------------

Write-Step "Site $SiteName on port $Port"
$sitePathIis = "IIS:\Sites\$SiteName"
if (-not (Test-Path $sitePathIis)) {
  New-Website -Name $SiteName -PhysicalPath $SitePath -ApplicationPool $SiteName -Port $Port -IPAddress '*' | Out-Null
} else {
  Set-ItemProperty $sitePathIis -Name physicalPath -Value $SitePath
  Set-ItemProperty $sitePathIis -Name applicationPool -Value $SiteName
  if (-not (Get-WebBinding -Name $SiteName -Protocol http -Port $Port)) {
    New-WebBinding -Name $SiteName -Protocol http -Port $Port -IPAddress '*'
  }
}

# --- IIS settings ------------------------------------------------------------

# The same settings either way: HttpPlatformHandler runs node.exe server.js on
# the port it picks, on loopback only, plus a 30 MB upload limit (the largest
# upload is a 25 MB presentation, lib/validation/presentation.ts).
$iisArgs = @{
  SiteName         = $SiteName
  SitePath         = $SitePath
  PlatformSettings = (Get-PlatformSettings $nodeExe $SitePath)
  PlatformEnv      = (Get-PlatformEnv)
}

$fallbackReason = $null
if ($IisConfig -eq 'WebConfig') {
  Write-Step "IIS settings for ${SiteName}: web.config"
  try {
    Set-WebConfigSettings @iisArgs -WrittenBy 'deploy/iis/install-local.ps1'
  } catch {
    $fallbackReason = "unlocking <handlers>/<httpPlatform> for $SiteName failed: $($_.Exception.Message)"
  }
}
if ($IisConfig -eq 'AppHost' -or $fallbackReason) {
  if ($fallbackReason) { Write-Warning "web.config method failed: $fallbackReason" }
  Write-Step "IIS settings for ${SiteName}: applicationHost.config"
  Set-AppHostSettings @iisArgs
}

# --- SQL Server login --------------------------------------------------------

Grant-SqlAppAccess -Settings $settings -Identity $identity

# --- Start -------------------------------------------------------------------

Write-Step 'Starting'
Start-SitePool $SiteName
$problem = Get-SiteProblem "$appUrl/api/health"

if ($problem -like 'HTTP 500.19*' -and (Test-Path $webConfigPath)) {
  $fallbackReason = "IIS refused it: $problem"
  Write-Warning "web.config method failed. $problem"
  Write-Step "IIS settings for ${SiteName}: switching to applicationHost.config"
  Stop-SitePool $SiteName $serverJs
  Set-AppHostSettings @iisArgs
  Start-SitePool $SiteName
  $problem = Get-SiteProblem "$appUrl/api/health"
}

$log = Get-NewestNodeLog $logsDir
if ($log) {
  Write-Host "`n--- $($log.FullName) ---"
  Get-Content $log.FullName -Tail 20
}

Write-Host ''
if ($problem) {
  Write-Warning "$appUrl/api/health did not answer ($problem). Check the log above and $logsDir."
} else {
  Write-Host "AIdea is running at $appUrl" -ForegroundColor Green
}
if ($fallbackReason) {
  Write-Warning "web.config method failed: $fallbackReason`n         The site runs with applicationHost.config settings instead (-IisConfig AppHost)."
}
$mode = if (Test-Path $webConfigPath) { "web.config ($webConfigPath)" } else { "applicationHost.config, <location path=`"$SiteName`">" }
Write-Host "  IIS settings: $mode"
Write-Host "  Site folder : $SitePath"
Write-Host "  Settings    : $envFile"
Write-Host "  Uploads     : $UploadDir"
Write-Host "  Runs as     : $identity"

if ($TranscriptPath) { Stop-Transcript | Out-Null }
if ($problem) { exit 1 }
