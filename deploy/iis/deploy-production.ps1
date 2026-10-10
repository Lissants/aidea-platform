<#
.SYNOPSIS
  Deploys or updates AIdea on the production IIS server over HTTPS.

.DESCRIPTION
  Run on the server, from any prompt: the script asks for administrator rights
  itself (UAC). Build the package on a developer PC first:
    npm run build:iis -- -AppUrl https://aidea.godrejindonesia.com -Zip
  and copy dist\iis\aidea-iis-<time>.zip plus this folder (deploy\iis) to the server.

  IIS runs Node itself through HttpPlatformHandler, as in install-local.ps1.
  Each run:
    - checks the server: IIS features, HttpPlatformHandler, Node 24, the ODBC
      driver and the TLS certificate for -HostName;
    - unpacks the package into <DataRoot>\releases\<build>, kept for -Rollback;
    - checks .env.production.local (written from -EnvFile on the first run);
    - backs up the IIS configuration and the site folder;
    - stops the site, backs up the database and applies pending migrations
      (only when there are any). If a migration fails, the old version starts
      again untouched;
    - mirrors the release into -SitePath and writes the IIS settings;
    - binds https://<HostName> (SNI) to the certificate, and a small
      <SiteName>-Redirect site on port 80 that sends http:// to https://;
    - registers the hourly "<SiteName> voting notifications" scheduled task;
    - starts the site and checks health, security headers, the redirect and
      that Node listens on loopback only.

.EXAMPLE
  deploy-production.cmd -Package D:\drop\aidea-iis-20261009-1700.zip -EnvFile D:\drop\aidea.env
  (first deployment)
.EXAMPLE
  deploy-production.cmd -Package D:\drop\aidea-iis-20261020-0930.zip
  (update)
.EXAMPLE
  deploy-production.cmd -Rollback
#>
[CmdletBinding()]
param(
  # The zip (or unpacked folder) from npm run build:iis -- -AppUrl https://<HostName> -Zip.
  [string]$Package,
  [string]$HostName = 'aidea.godrejindonesia.com',
  # Default: the newest valid certificate in LocalMachine\My issued for -HostName.
  [string]$CertThumbprint,
  [string]$SiteName = 'AIdea',
  [string]$SitePath = 'C:\inetpub\aidea',
  # Releases, backups, deployment logs and the default upload folder.
  [string]$DataRoot = 'C:\aidea',
  # First deployment only: the settings file, see production.env.example.
  [string]$EnvFile,
  [ValidateSet('WebConfig', 'AppHost')]
  [string]$IisConfig = 'WebConfig',
  [switch]$SkipMigrations,
  [switch]$SkipDbBackup,
  # Folder on the SQL Server host for the pre-migration backup (default: the instance's backup folder).
  [string]$DbBackupDir,
  # SQL login for migrations (password is asked). Default: your own Windows login.
  [string]$MigrationLogin,
  [int]$KeepReleases = 5,
  # Puts back the release before the current one. The database is not rolled back.
  [switch]$Rollback,
  [switch]$NoBackup,
  # Set by the script itself when it re-launches elevated.
  [string]$TranscriptPath
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$logDir = Join-Path $DataRoot 'deploy-logs'
Invoke-SelfElevation -BoundParameters $PSBoundParameters -ScriptPath $PSCommandPath -LogDir $logDir -LogPrefix 'deploy'

if (-not $TranscriptPath) {
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $TranscriptPath = Join-Path $logDir ('deploy-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
Start-Transcript -Path $TranscriptPath | Out-Null
trap {
  Write-Host "`nERROR: $_" -ForegroundColor Red
  Stop-Transcript | Out-Null
  exit 1
}

$appUrl = "https://$HostName"
$identity = "IIS AppPool\$SiteName"
$redirectSite = "$SiteName-Redirect"
$releasesDir = Join-Path $DataRoot 'releases'
$currentFile = Join-Path $releasesDir 'current.txt'
$historyFile = Join-Path $releasesDir 'history.log'
$envFilePath = Join-Path $SitePath '.env.production.local'
$serverJs = Join-Path $SitePath 'server.js'
$webConfigPath = Join-Path $SitePath 'web.config'
$logsDir = Join-Path $SitePath 'logs'
$cacheDir = Join-Path $SitePath '.next\cache'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$problems = New-Object System.Collections.Generic.List[string]
$notes = New-Object System.Collections.Generic.List[string]

function Add-Note([string]$Message) { $notes.Add($Message); Write-Warning $Message }

# Response headers of a GET to -HostName on this server itself (whatever DNS
# says), as a lower-case name => value map plus 'status'.
function Get-Headers([string]$Url) {
  $response = Invoke-SiteRequest $Url -Loopback
  $map = $response.Headers.Clone()
  $map['status'] = "$($response.Status)"
  $map
}

function Get-CurrentRelease { if (Test-Path $currentFile) { (Get-Content $currentFile -Raw).Trim() } }

# --- Release to deploy -------------------------------------------------------

if ($Rollback) {
  if ($Package) { throw '-Rollback chooses the previous release itself: leave out -Package.' }
  $current = Get-CurrentRelease
  if (-not $current) { throw "No current release is recorded in $currentFile." }
  # Release names start with the build time, so they sort in build order.
  $previous = Get-ChildItem $releasesDir -Directory | Where-Object { $_.Name -lt $current -and $_.Name -notlike '_*' } |
    Sort-Object Name | Select-Object -Last 1
  if (-not $previous) { throw "No release older than $current in $releasesDir." }
  Write-Step "Rolling back from $current to $($previous.Name)"
  $Package = $previous.FullName
  $SkipMigrations = $true
}
if (-not $Package) { throw '-Package is required: the zip from npm run build:iis -- -AppUrl https://<host> -Zip.' }
if (-not (Test-Path $Package)) { throw "No package at $Package." }

Write-Step 'Unpacking'
New-Item -ItemType Directory -Force -Path $releasesDir | Out-Null
$source = (Resolve-Path $Package).Path
if (Test-Path $source -PathType Leaf) {
  $incoming = Join-Path $releasesDir "_incoming-$stamp"
  New-Item -ItemType Directory -Path $incoming | Out-Null
  # Windows' own bsdtar reads zips; a GNU tar earlier on PATH (Git) can't.
  $tar = Join-Path $env:windir 'System32\tar.exe'
  if (Test-Path $tar) {
    Invoke-Native { & $tar -x -f $source -C $incoming }
  } else {
    Expand-Archive -Path $source -DestinationPath $incoming
  }
  $source = $incoming
}
$infoPath = Join-Path $source 'build-info.json'
if (-not (Test-Path $infoPath) -or -not (Test-Path (Join-Path $source 'server.js'))) {
  throw "$Package is not an AIdea package (no server.js / build-info.json at its root)."
}
$buildInfo = Get-Content $infoPath -Raw | ConvertFrom-Json
if ($buildInfo.appUrl -ne $appUrl) {
  throw "The package was built for $($buildInfo.appUrl), not $appUrl. Rebuild with: npm run build:iis -- -AppUrl $appUrl -Zip"
}
if (-not (Test-Path (Join-Path $source 'tools\migrate.cjs'))) {
  throw 'The package has no tools\migrate.cjs: it was built by an older build-package.ps1. Rebuild it.'
}
$releaseName = ('{0}-{1}' -f ([datetime]$buildInfo.builtAt).ToString('yyyyMMdd-HHmmss'), $buildInfo.commit).TrimEnd('-')
$release = Join-Path $releasesDir $releaseName
if ($source -ne $release) {
  if (Test-Path $release) { Remove-Item $release -Recurse -Force }
  if ($source -like "$releasesDir\_incoming-*") {
    Move-Item $source $release
  } else {
    Invoke-Native { robocopy $source $release /E /NFL /NDL /NJH /NJS /NP /R:2 /W:2 } -MaxExitCode 7
  }
}
Write-Host "  Release : $releaseName (commit $($buildInfo.commit), built $($buildInfo.builtAt), Next $($buildInfo.next))"
Write-Host "  Folder  : $release"

# --- Server prerequisites ----------------------------------------------------

Write-Step 'Checking the server'
if (Get-Command Install-WindowsFeature -ErrorAction SilentlyContinue) {
  # Windows Server.
  $missing = @(Get-WindowsFeature 'Web-Server', 'Web-Http-Redirect', 'Web-Scripting-Tools' |
      Where-Object { -not $_.Installed })
  if ($missing) {
    Write-Host "  Installing Windows features: $($missing.Name -join ', ')"
    $result = Install-WindowsFeature -Name $missing.Name
    if ("$($result.RestartNeeded)" -eq 'Yes') { Add-Note 'Windows asks for a restart to finish installing IIS features.' }
  }
} else {
  # Windows 10/11, for a trial run on a PC.
  foreach ($feature in 'IIS-WebServer', 'IIS-HttpRedirect', 'IIS-ManagementScriptingTools') {
    if ((Get-WindowsOptionalFeature -Online -FeatureName $feature).State -ne 'Enabled') {
      Write-Host "  Enabling Windows feature $feature"
      Enable-WindowsOptionalFeature -Online -FeatureName $feature -All -NoRestart | Out-Null
    }
  }
}
Import-Module WebAdministration

if (-not (Test-Path (Join-Path $env:windir 'System32\inetsrv\httpPlatformHandler.dll'))) {
  throw 'HttpPlatformHandler is not installed. Install "HttpPlatformHandler v1.2" (x64) from https://www.iis.net/downloads/microsoft/httpplatformhandler, then run this again.'
}
$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) { throw 'Node.js is not installed. Install Node.js 24 (x64 MSI, for all users).' }
if ($nodeExe -like "$env:SystemDrive\Users\*") {
  throw "node.exe is under a user profile ($nodeExe), which the app pool cannot read. Install Node.js 24 for all users (C:\Program Files\nodejs)."
}
$nodeVersion = (& $nodeExe -v).Trim()
if ($nodeVersion -notmatch '^v24\.') { throw "Node 24 is required (found $nodeVersion at $nodeExe); the package was built with $($buildInfo.node)." }

# TLS certificate.
$thumbprint = "$CertThumbprint" -replace '[^0-9A-Fa-f]', ''
$cert = if ($thumbprint) {
  Get-Item "Cert:\LocalMachine\My\$thumbprint" -ErrorAction SilentlyContinue
} else {
  Get-ChildItem Cert:\LocalMachine\My | Where-Object {
    $names = @($_.DnsNameList | ForEach-Object { $_.Unicode })
    $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) -and ($names | Where-Object { $HostName -like $_ })
  } | Sort-Object NotAfter -Descending | Select-Object -First 1
}
if (-not $cert) {
  throw "No certificate for $HostName in Local Computer > Personal. Import the .pfx from IT there (with its private key), or pass -CertThumbprint."
}
$certNames = @($cert.DnsNameList | ForEach-Object { $_.Unicode })
if (-not $cert.HasPrivateKey) { throw "Certificate $($cert.Thumbprint) has no private key: import the .pfx, not the .cer." }
if ($cert.NotAfter -le (Get-Date)) { throw "Certificate $($cert.Thumbprint) expired on $($cert.NotAfter)." }
if (-not ($certNames | Where-Object { $HostName -like $_ })) {
  throw "Certificate $($cert.Thumbprint) is for $($certNames -join ', '), not $HostName."
}
if ($cert.NotAfter -lt (Get-Date).AddDays(30)) { Add-Note "The certificate expires on $($cert.NotAfter.ToString('yyyy-MM-dd')). Ask IT for a new one." }
Write-Host "  Certificate : $($cert.Subject), expires $($cert.NotAfter.ToString('yyyy-MM-dd')), thumbprint $($cert.Thumbprint)"
Write-Host "  Node        : $nodeVersion ($nodeExe)"

# Nobody else may answer for this host name.
$taken = Get-WebBinding | Where-Object {
  ($_.bindingInformation -eq "*:443:$HostName" -or $_.bindingInformation -eq "*:80:$HostName") -and
  $_.ItemXPath -notmatch "@name='($([regex]::Escape($SiteName))|$([regex]::Escape($redirectSite)))'"
}
if ($taken) { throw "Another IIS site already answers for ${HostName}: $($taken.ItemXPath -join ', ')" }

# --- Settings ----------------------------------------------------------------

Write-Step "Settings ($envFilePath)"
New-Item -ItemType Directory -Force -Path $SitePath | Out-Null
if (-not (Test-Path $envFilePath)) {
  if (-not $EnvFile) { throw 'First deployment: pass -EnvFile <file>. Start from deploy\iis\production.env.example.' }
  if (-not (Test-Path $EnvFile)) { throw "No settings file at $EnvFile." }
  # IIS sets these itself.
  $dropped = 'PORT', 'HOSTNAME', 'NODE_ENV'
  $lines = @(Get-Content $EnvFile | Where-Object {
      -not ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=' -and $dropped -contains $Matches[1])
    })
  $given = Read-EnvFile $EnvFile
  foreach ($secretName in 'SESSION_SECRET', 'CRON_SECRET') {
    if (-not $given[$secretName]) {
      $bytes = New-Object byte[] 48
      [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
      $lines = @($lines | Where-Object { $_ -notmatch "^\s*$secretName\s*=" }) + "$secretName=$([Convert]::ToBase64String($bytes))"
      Write-Host "  Generated a new $secretName."
    }
  }
  if (-not $given['NEXT_PUBLIC_APP_URL']) { $lines += "NEXT_PUBLIC_APP_URL=$appUrl" }
  if (-not $given['UPLOAD_DIR']) { $lines += "UPLOAD_DIR=$(Join-Path $DataRoot 'uploads')" }
  $content = @(
    "# AIdea production settings. Written by deploy/iis/deploy-production.ps1 from $EnvFile on $((Get-Date).ToString('s')).",
    "# Kept across updates. After editing, run: Restart-WebAppPool $SiteName"
  ) + $lines
  [IO.File]::WriteAllLines($envFilePath, [string[]]$content, (New-Object Text.UTF8Encoding $false))
  # Readable by administrators only until the app pool exists (see Permissions).
  Invoke-Native { icacls $envFilePath /inheritance:r /grant:r '*S-1-5-32-544:(F)' '*S-1-5-18:(F)' /Q }
  Write-Host "  Written. Delete $EnvFile now if it holds passwords: the server copy is the one in use."
} elseif ($EnvFile) {
  Add-Note "$envFilePath already exists, so -EnvFile was ignored. Edit that file to change settings."
}
$settings = Read-EnvFile $envFilePath

$errors = New-Object System.Collections.Generic.List[string]
if ($settings['NEXT_PUBLIC_APP_URL'] -ne $appUrl) { $errors.Add("NEXT_PUBLIC_APP_URL must be $appUrl (it is '$($settings['NEXT_PUBLIC_APP_URL'])').") }
if ("$($settings['SESSION_SECRET'])".Length -lt 32) { $errors.Add('SESSION_SECRET must be at least 32 characters. Remove the line and deploy again with -EnvFile to generate one, or set it yourself.') }
$ldapUrls = @("$($settings['LDAP_URL'])" -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if (-not $ldapUrls) { $errors.Add('LDAP_URL is empty: nobody could sign in. Set ldaps://<domain controller>:636 (two or more, comma-separated).') }
elseif ($ldapUrls | Where-Object { $_ -notmatch '^ldaps://' }) { $errors.Add('LDAP_URL must use ldaps:// only (production refuses ldap://).') }
elseif ($ldapUrls.Count -lt 2) { Add-Note 'LDAP_URL lists one domain controller. If it is down nobody can sign in; add a second one.' }
if ($settings['LDAP_CA_CERT_PATH']) {
  if (-not (Test-Path $settings['LDAP_CA_CERT_PATH'])) { $errors.Add("LDAP_CA_CERT_PATH points to a missing file: $($settings['LDAP_CA_CERT_PATH'])") }
} else {
  Add-Note 'LDAP_CA_CERT_PATH is empty: domain controller certificates from the corporate CA will not be trusted.'
}
if (-not $settings['ALLOWED_EMAIL_DOMAIN']) { $errors.Add('ALLOWED_EMAIL_DOMAIN is empty (e.g. godrejcp.com).') }
if (-not $settings['AD_ADMIN_EMAILS']) { Add-Note 'AD_ADMIN_EMAILS is empty: nobody will be an Admin.' }
if ($settings['SESSION_COOKIE_SECURE'] -eq 'false') { $errors.Add('Remove SESSION_COOKIE_SECURE=false: production cookies must be Secure.') }
foreach ($devOnly in 'DEMO_PASSWORD', 'DEV_ALLOWED_ORIGINS') {
  if ($settings[$devOnly]) { $errors.Add("Remove ${devOnly}: it is for development only.") }
}
if ($settings['MSSQL_TRUST_CERT'] -in 'true', '1') { Add-Note 'MSSQL_TRUST_CERT=true: the SQL Server certificate is not verified. Remove it once SQL Server has its certificate.' }
$sqlHost = ("$($settings['MSSQL_SERVER'])" -split '[\\,]')[0]
if (-not $sqlHost -or ($sqlHost -in '.', '(local)', 'localhost') -or $sqlHost -match '^\d+(\.\d+){3}$') {
  if ($settings['MSSQL_TRUST_CERT'] -notin 'true', '1') {
    Add-Note "MSSQL_SERVER='$($settings['MSSQL_SERVER'])' is not a host name, so it cannot match the SQL Server certificate. Use the server's FQDN."
  }
}
if ($errors.Count) { throw ("Fix these in ${envFilePath}:`n  - " + ($errors -join "`n  - ")) }

if ($settings['MSSQL_DRIVER'] -ne 'tedious') {
  $odbc = if ($settings['MSSQL_ODBC_DRIVER']) { $settings['MSSQL_ODBC_DRIVER'] } else { 'ODBC Driver 18 for SQL Server' }
  if (-not (Test-Path "HKLM:\SOFTWARE\ODBC\ODBCINST.INI\$odbc")) { throw "$odbc is not installed. Install it from Microsoft (x64), then run this again." }
}
$uploadDir = if ($settings['UPLOAD_DIR']) { $settings['UPLOAD_DIR'] } else { Join-Path $DataRoot 'uploads' }
Write-Host '  OK'

# --- Backup ------------------------------------------------------------------

if (-not $NoBackup) {
  Write-Step 'Backup'
  Backup-AIdeaSite -SiteName $SiteName -SitePath $SitePath -BackupRoot (Join-Path $DataRoot 'backups') -Stamp $stamp
}

# --- Stop, migrate -----------------------------------------------------------

Write-Step "App pool $SiteName"
$firstInstall = -not (Test-Path "IIS:\AppPools\$SiteName")
Set-AIdeaAppPool $SiteName
Stop-SitePool $SiteName $serverJs

# Brings the previous version back up after a failed migration.
function Restart-PreviousVersion { if (Test-Path "IIS:\Sites\$SiteName") { Start-SitePool $SiteName } }

# Runs tools\migrate.cjs from the release with the site's settings, as the
# deploying administrator (or -MigrationLogin), in a child process only.
function Invoke-Migrate([string[]]$Arguments, [System.Security.SecureString]$Password) {
  $vars = @{}
  foreach ($key in $settings.Keys) { $vars[$key] = $settings[$key] }
  $vars['NODE_ENV'] = 'production'
  $vars['MSSQL_REQUEST_TIMEOUT_MS'] = '1800000'
  $vars['MSSQL_USER'] = $MigrationLogin
  $vars['MSSQL_PASSWORD'] = if ($Password) { [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)) } else { '' }
  $saved = @{}
  foreach ($key in $vars.Keys) { $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
  $previous = $ErrorActionPreference
  try {
    foreach ($key in $vars.Keys) { [Environment]::SetEnvironmentVariable($key, $(if ($vars[$key]) { $vars[$key] } else { $null }), 'Process') }
    $ErrorActionPreference = 'Continue'
    $output = @(& $nodeExe (Join-Path $release 'tools\migrate.cjs') @Arguments 2>&1 | ForEach-Object { "$_" })
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
    foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
  }
  [pscustomobject]@{ Output = $output; ExitCode = $code }
}

if ($SkipMigrations) {
  Write-Step 'Migrations: skipped'
} else {
  Write-Step 'Migrations'
  $password = $null
  if ($MigrationLogin) { $password = Read-Host "Password for SQL login $MigrationLogin" -AsSecureString }
  else { Write-Host "  Connecting as $env:USERDOMAIN\$env:USERNAME (Windows authentication)" }
  $pending = Invoke-Migrate @('--pending') $password
  if ($pending.ExitCode -ne 0) {
    Restart-PreviousVersion
    throw "Could not read the migration state (the previous version is running again):`n$($pending.Output -join "`n")"
  }
  $pendingFiles = @($pending.Output | Where-Object { $_ -match '\.sql$' })
  if (-not $pendingFiles) {
    Write-Host '  Database is up to date.'
  } else {
    Write-Host "  Pending: $($pendingFiles -join ', ')"
    $migrateArgs = @()
    if (-not $SkipDbBackup) {
      $migrateArgs += '--backup-first'
      if ($DbBackupDir) { $migrateArgs += "--backup-dir=$DbBackupDir" }
    }
    $result = Invoke-Migrate $migrateArgs $password
    $result.Output | ForEach-Object { Write-Host "  $_" }
    if ($result.ExitCode -ne 0) {
      Restart-PreviousVersion
      throw 'The database backup or a migration failed (output above). Nothing was deployed and the previous version is running again. Each migration file is one transaction, so a failed one left no changes; those listed as applied stay applied.'
    }
  }
}

# --- Files and permissions ---------------------------------------------------

Write-Step "Copying $releaseName to $SitePath"
Copy-AIdeaPackage $release $SitePath

Write-Step "Permissions for $identity"
foreach ($dir in $logsDir, $cacheDir, $uploadDir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
Invoke-Native { icacls $SitePath /grant "${identity}:(OI)(CI)RX" /Q }
foreach ($dir in $logsDir, $cacheDir, $uploadDir) {
  Invoke-Native { icacls $dir /grant "${identity}:(OI)(CI)M" /Q }
}
# The settings file holds SESSION_SECRET: administrators, SYSTEM and the app pool only.
Invoke-Native { icacls $envFilePath /inheritance:r /grant:r '*S-1-5-32-544:(F)' '*S-1-5-18:(F)' "${identity}:(R)" /Q }
if ($settings['LDAP_CA_CERT_PATH']) { Invoke-Native { icacls $settings['LDAP_CA_CERT_PATH'] /grant "${identity}:(R)" /Q } }

# --- IIS sites ---------------------------------------------------------------

Write-Step "Site $SiteName on $appUrl"
$sitePathIis = "IIS:\Sites\$SiteName"
if (-not (Test-Path $sitePathIis)) {
  New-Website -Name $SiteName -PhysicalPath $SitePath -ApplicationPool $SiteName -Port 443 -HostHeader $HostName -Ssl -SslFlags 1 | Out-Null
} else {
  Set-ItemProperty $sitePathIis -Name physicalPath -Value $SitePath
  Set-ItemProperty $sitePathIis -Name applicationPool -Value $SiteName
}
# Exactly one binding: https, port 443, this host name, SNI.
Get-WebBinding -Name $SiteName | Where-Object { $_.protocol -ne 'https' -or $_.bindingInformation -ne "*:443:$HostName" } | Remove-WebBinding
$binding = Get-WebBinding -Name $SiteName -Protocol https -Port 443 -HostHeader $HostName
if (-not $binding) {
  New-WebBinding -Name $SiteName -Protocol https -Port 443 -HostHeader $HostName -IPAddress '*' -SslFlags 1
  $binding = Get-WebBinding -Name $SiteName -Protocol https -Port 443 -HostHeader $HostName
}
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter "system.applicationHost/sites/site[@name='$SiteName']/bindings/binding[@protocol='https' and @bindingInformation='*:443:$HostName']" -Name sslFlags -Value 1
$sslPath = "IIS:\SslBindings\!443!$HostName"
$sslBinding = Get-Item $sslPath -ErrorAction SilentlyContinue
if ($sslBinding -and $sslBinding.Thumbprint -ne $cert.Thumbprint) {
  Remove-Item $sslPath
  $sslBinding = $null
}
if (-not $sslBinding) { $binding.AddSslCertificate($cert.Thumbprint, 'My') }

# HttpPlatformHandler: node.exe server.js on loopback, same settings as install-local.ps1.
$iisArgs = @{
  SiteName         = $SiteName
  SitePath         = $SitePath
  PlatformSettings = (Get-PlatformSettings $nodeExe $SitePath)
  PlatformEnv      = (Get-PlatformEnv)
}
$fallbackReason = $null
if ($IisConfig -eq 'WebConfig') {
  try {
    Set-WebConfigSettings @iisArgs -WrittenBy 'deploy/iis/deploy-production.ps1'
  } catch {
    $fallbackReason = "unlocking <handlers>/<httpPlatform> for $SiteName failed: $($_.Exception.Message)"
  }
}
if ($IisConfig -eq 'AppHost' -or $fallbackReason) {
  if ($fallbackReason) { Add-Note "web.config method failed: $fallbackReason" }
  Set-AppHostSettings @iisArgs
}

Write-Step "Site $redirectSite on http://$HostName (redirects to https)"
$redirectPath = Join-Path $DataRoot 'redirect-site'
New-Item -ItemType Directory -Force -Path $redirectPath | Out-Null
if (-not (Test-Path "IIS:\AppPools\$redirectSite")) { New-WebAppPool -Name $redirectSite | Out-Null }
Set-ItemProperty "IIS:\AppPools\$redirectSite" -Name managedRuntimeVersion -Value ''
if (-not (Test-Path "IIS:\Sites\$redirectSite")) {
  New-Website -Name $redirectSite -PhysicalPath $redirectPath -ApplicationPool $redirectSite -Port 80 -HostHeader $HostName | Out-Null
}
Get-WebBinding -Name $redirectSite | Where-Object { $_.protocol -ne 'http' -or $_.bindingInformation -ne "*:80:$HostName" } | Remove-WebBinding
if (-not (Get-WebBinding -Name $redirectSite -Protocol http -Port 80 -HostHeader $HostName)) {
  New-WebBinding -Name $redirectSite -Protocol http -Port 80 -HostHeader $HostName -IPAddress '*'
}
# $S$Q keeps the path and query string.
$redirect = @{ PSPath = 'MACHINE/WEBROOT/APPHOST'; Location = $redirectSite; Filter = 'system.webServer/httpRedirect' }
Set-WebConfigurationProperty @redirect -Name enabled -Value $true
Set-WebConfigurationProperty @redirect -Name destination -Value "https://$HostName`$S`$Q"
Set-WebConfigurationProperty @redirect -Name exactDestination -Value $true
Set-WebConfigurationProperty @redirect -Name httpResponseStatus -Value 'Permanent'

# --- SQL Server access for the app pool --------------------------------------

Grant-SqlAppAccess -Settings $settings -Identity $identity

# --- Voting notifications (hourly) -------------------------------------------

$taskName = "$SiteName voting notifications"
if ($settings['CRON_SECRET']) {
  Write-Step "Scheduled task '$taskName'"
  # Copied out of the deployment folder, which may be a temporary drop.
  $taskScript = Join-Path $DataRoot 'tasks\voting-notifications.ps1'
  New-Item -ItemType Directory -Force -Path (Split-Path $taskScript) | Out-Null
  Copy-Item (Join-Path $PSScriptRoot 'voting-notifications.ps1') $taskScript -Force
  Copy-Item (Join-Path $PSScriptRoot 'common.ps1') (Split-Path $taskScript) -Force
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
    "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$taskScript`" -EnvFile `"$envFilePath`" -HostName $HostName")
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Hours 1)
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
} else {
  Add-Note "CRON_SECRET is empty, so voting notifications are not scheduled. Set it in $envFilePath and deploy again."
}

# --- Start and check ---------------------------------------------------------

Write-Step 'Starting'
Start-SitePool $SiteName
Start-SitePool $redirectSite
$problem = Get-SiteProblem "$appUrl/api/health" -Loopback
if ($problem -like 'HTTP 500.19*' -and (Test-Path $webConfigPath)) {
  Add-Note "web.config method failed. $problem. Switched to applicationHost.config (-IisConfig AppHost)."
  Stop-SitePool $SiteName $serverJs
  Set-AppHostSettings @iisArgs
  Start-SitePool $SiteName
  $problem = Get-SiteProblem "$appUrl/api/health" -Loopback
}

Write-Step 'Checks'
if ($problem) {
  $problems.Add("$appUrl/api/health did not answer ($problem).")
} else {
  Write-Host '  Health          : OK'

  # Certificate as this server sees it (users' PCs should trust the same CA).
  if ((Invoke-SiteRequest "$appUrl/api/health" -Loopback).Trusted) { Write-Host '  Certificate     : trusted' }
  else { Add-Note "This server does not trust the certificate for $HostName. Check from a user's PC that the browser shows no warning." }

  $headers = Get-Headers "$appUrl/sign-in"
  if ($headers['strict-transport-security']) { Write-Host '  HSTS            : OK' } else { $problems.Add('/sign-in has no Strict-Transport-Security header.') }
  if ($headers['x-frame-options'] -eq 'DENY') { Write-Host '  X-Frame-Options : DENY' } else { $problems.Add("/sign-in sends X-Frame-Options '$($headers['x-frame-options'])', expected DENY.") }
  if ($headers['server']) { Add-Note "Responses still carry a Server header ($($headers['server']))." }

  $plain = Get-Headers "http://$HostName/sign-in?check=1"
  if ($plain['status'] -eq '301' -and $plain['location'] -eq "$appUrl/sign-in?check=1") { Write-Host '  http -> https   : OK' }
  else { $problems.Add("http://$HostName/sign-in?check=1 answered $($plain['status']) -> '$($plain['location'])', expected 301 -> $appUrl/sign-in?check=1.") }

  $landing = Get-Headers "$appUrl/"
  if ($landing['location'] -like 'http://*') { Add-Note "The app redirects to $($landing['location']) (http). It still works through the redirect site and HSTS." }

  $nodePids = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
      Where-Object { $_.CommandLine -and $_.CommandLine.Contains($serverJs) } | Select-Object -ExpandProperty ProcessId)
  $exposed = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $nodePids -contains $_.OwningProcess -and $_.LocalAddress -notin '127.0.0.1', '::1' })
  if ($exposed) { $problems.Add("Node listens on $(($exposed | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" }) -join ', '), not only on loopback.") }
  elseif ($nodePids) { Write-Host '  Node            : loopback only' }
}

$log = Get-NewestNodeLog $logsDir
if ($log) {
  $flagged = @(Get-Content $log.FullName | Where-Object { $_ -match '\[(security|auth)\]' })
  foreach ($line in $flagged) { Add-Note "From the app log: $line" }
  if ($problem) {
    Write-Host "`n--- $($log.FullName) ---"
    Get-Content $log.FullName -Tail 30
  }
}

# --- Record and summarise ----------------------------------------------------

Write-Host ''
if ($problems.Count) {
  Write-Host 'Deployment finished with problems:' -ForegroundColor Red
  $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  Write-Host "Logs: $logsDir. To put the previous release back: deploy-production.cmd -Rollback"
} else {
  $previousRelease = Get-CurrentRelease
  Set-Content -Path $currentFile -Value $releaseName -Encoding ASCII
  Add-Content -Path $historyFile -Value ("{0}`t{1}`t{2}" -f (Get-Date).ToString('s'), $(if ($Rollback) { 'rollback' } else { 'deploy' }), $releaseName) -Encoding ASCII
  # Keep the newest releases, plus the current one and the one before it.
  $keep = @($releaseName, $previousRelease) + @(Get-ChildItem $releasesDir -Directory | Where-Object { $_.Name -notlike '_*' } |
      Sort-Object Name -Descending | Select-Object -First $KeepReleases -ExpandProperty Name)
  Get-ChildItem $releasesDir -Directory | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Recurse -Force
  Write-Host "AIdea $releaseName is live at $appUrl" -ForegroundColor Green
}
if ($notes.Count) {
  Write-Host 'Notes:' -ForegroundColor Yellow
  $notes | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}
$mode = if (Test-Path $webConfigPath) { "web.config ($webConfigPath)" } else { "applicationHost.config, <location path=`"$SiteName`">" }
Write-Host "  IIS settings : $mode"
Write-Host "  Site folder  : $SitePath"
Write-Host "  Settings     : $envFilePath"
Write-Host "  Uploads      : $uploadDir"
Write-Host "  Runs as      : $identity"
Write-Host "  Releases     : $releasesDir"
Write-Host "  This log     : $TranscriptPath"
if ($firstInstall) { Write-Host "  First install: sign in at $appUrl with an account in AD_ADMIN_EMAILS and open Settings to confirm AD sign-in." }

Stop-Transcript | Out-Null
if ($problems.Count) { exit 1 }
