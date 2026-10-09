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

# --- Elevation ---------------------------------------------------------------

# Re-launch elevated (UAC prompt), then print what the elevated run did here.
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $logDir = Join-Path $root 'dist\iis'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $transcript = Join-Path $logDir ('install-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  $forward = foreach ($param in $PSBoundParameters.GetEnumerator()) {
    if ($param.Value -is [System.Management.Automation.SwitchParameter]) {
      if ($param.Value.IsPresent) { "-$($param.Key)" }
    } else {
      "-$($param.Key)"; "`"$($param.Value)`""
    }
  }
  $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"") + $forward + @('-TranscriptPath', "`"$transcript`"")
  Write-Host 'Administrator rights are needed: approve the Windows (UAC) prompt.' -ForegroundColor Yellow
  $child = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
  if (Test-Path $transcript) {
    # Skip the transcript's own header and footer.
    $stars = 0
    foreach ($line in Get-Content $transcript) {
      if ($line -match '^\*{10,}$') { $stars++; continue }
      if ($stars -eq 2 -and $line -notmatch '^Transcript started') { $line }
    }
    Write-Host "(Saved to $transcript)"
  }
  exit $child.ExitCode
}

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

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }

# Native commands write to stderr; rely on their exit code instead, and show
# their output only when they fail.
function Invoke-Native([scriptblock]$Command, [int]$MaxExitCode = 0) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $output = & $Command 2>&1 } finally { $ErrorActionPreference = $previous }
  if ($LASTEXITCODE -gt $MaxExitCode) {
    throw "Command failed (exit $LASTEXITCODE): $Command`n$(($output | Out-String).Trim())"
  }
}

function Read-EnvFile([string]$Path) {
  $map = @{}
  foreach ($line in Get-Content $Path) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
      $map[$Matches[1]] = $Matches[2].Trim('"', "'")
    }
  }
  $map
}

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
  # Snapshot of all IIS configuration (applicationHost.config and friends).
  $iisBackup = "$($SiteName.ToLower())-$stamp"
  Backup-WebConfiguration -Name $iisBackup | Out-Null
  Write-Host "  IIS configuration : $env:windir\System32\inetsrv\backup\$iisBackup"
  Write-Host "    restore with    : Restore-WebConfiguration -Name $iisBackup   (all IIS sites, as they are now)"
  if (Test-Path $serverJs) {
    # /COPY:DATS keeps .env.production.local readable by administrators only.
    $siteBackup = Join-Path $BackupRoot "$stamp\site"
    Invoke-Native {
      robocopy $SitePath $siteBackup /E /COPY:DATS /NFL /NDL /NJH /NJS /NP /R:1 /W:1 `
        /XD (Join-Path $SitePath 'logs') (Join-Path $SitePath '.next\cache')
    } -MaxExitCode 7
    Write-Host "  Site folder       : $siteBackup"
    Write-Host "    restore with    : robocopy `"$siteBackup`" `"$SitePath`" /MIR /COPY:DATS /XD `"$SitePath\logs`" `"$SitePath\.next\cache`""
  }
}

# --- App pool ----------------------------------------------------------------

function Stop-SitePool {
  # Node holds msnodesqlv8.node open, so wait until it has exited too.
  if ((Get-WebAppPoolState -Name $SiteName).Value -ne 'Stopped') { Stop-WebAppPool -Name $SiteName }
  for ($i = 0; $i -lt 30; $i++) {
    $running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
      Where-Object { $_.CommandLine -and $_.CommandLine.Contains($serverJs) }
    if ((Get-WebAppPoolState -Name $SiteName).Value -eq 'Stopped' -and -not $running) { return }
    Start-Sleep -Seconds 1
  }
}

function Start-SitePool {
  if ((Get-WebAppPoolState -Name $SiteName).Value -ne 'Started') { Start-WebAppPool -Name $SiteName }
  if ((Get-WebsiteState -Name $SiteName).Value -ne 'Started') { Start-Website -Name $SiteName }
}

Write-Step "App pool $SiteName"
$poolPath = "IIS:\AppPools\$SiteName"
if (-not (Test-Path $poolPath)) { New-WebAppPool -Name $SiteName | Out-Null }
Set-ItemProperty $poolPath -Name managedRuntimeVersion -Value ''          # No Managed Code
Set-ItemProperty $poolPath -Name startMode -Value 'AlwaysRunning'
Set-ItemProperty $poolPath -Name processModel.identityType -Value 'ApplicationPoolIdentity'
Set-ItemProperty $poolPath -Name processModel.idleTimeout -Value ([TimeSpan]::Zero)
Set-ItemProperty $poolPath -Name processModel.loadUserProfile -Value $true
Stop-SitePool

# --- Files -------------------------------------------------------------------

Write-Step "Copying $Package to $SitePath"
New-Item -ItemType Directory -Force -Path $SitePath | Out-Null
$savedEnv = if (Test-Path $envFile) { [IO.File]::ReadAllText($envFile) } else { $null }
Invoke-Native {
  robocopy $Package $SitePath /MIR /NFL /NDL /NJH /NJS /NP /R:2 /W:2 `
    /XD (Join-Path $SitePath 'logs') (Join-Path $SitePath '.next\cache') `
    /XF '.env.production.local'
} -MaxExitCode 7
if ($savedEnv -and -not (Test-Path $envFile)) { [IO.File]::WriteAllText($envFile, $savedEnv) }

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
$at = @{ PSPath = 'MACHINE/WEBROOT/APPHOST'; Location = $SiteName }
$handlerXPath = "system.webServer/handlers/add[@name='httpPlatformHandler']"
$httpPlatform = 'system.webServer/httpPlatform'
$platformSettings = [ordered]@{
  processPath       = $nodeExe
  arguments         = $serverJs
  startupTimeLimit  = 60
  startupRetryCount = 3
  requestTimeout    = '00:05:00'
  stdoutLogEnabled  = $true
  stdoutLogFile     = (Join-Path $SitePath 'logs\node')
}
$platformEnv = [ordered]@{ PORT = '%HTTP_PLATFORM_PORT%'; HOSTNAME = '127.0.0.1'; NODE_ENV = 'production' }

# -IisConfig AppHost: applicationHost.config, under <location path="$SiteName">.
# Section locks only restrict web.config files, so this always works.
function Set-AppHostSettings {
  Remove-Item $webConfigPath -Force -ErrorAction SilentlyContinue
  if (-not (Get-WebConfigurationProperty @at -Filter $handlerXPath -Name name -ErrorAction SilentlyContinue)) {
    Add-WebConfigurationProperty @at -Filter 'system.webServer/handlers' -Name '.' -Value @{
      name = 'httpPlatformHandler'; path = '*'; verb = '*'; modules = 'httpPlatformHandler'; resourceType = 'Unspecified'
    }
  }
  foreach ($name in $platformSettings.Keys) {
    Set-WebConfigurationProperty @at -Filter $httpPlatform -Name $name -Value $platformSettings[$name]
  }
  foreach ($name in $platformEnv.Keys) {
    $existing = "$httpPlatform/environmentVariables/environmentVariable[@name='$name']"
    if (-not (Get-WebConfigurationProperty @at -Filter $existing -Name name -ErrorAction SilentlyContinue)) {
      Add-WebConfigurationProperty @at -Filter "$httpPlatform/environmentVariables" -Name '.' -Value @{ name = $name; value = $platformEnv[$name] }
    }
  }
  Set-WebConfigurationProperty @at -Filter 'system.webServer/security/requestFiltering/requestLimits' -Name maxAllowedContentLength -Value 31457280
  Set-WebConfigurationProperty @at -Filter 'system.webServer/security/requestFiltering' -Name removeServerHeader -Value $true
  $poweredBy = "system.webServer/httpProtocol/customHeaders/add[@name='X-Powered-By']"
  if (Get-WebConfigurationProperty @at -Filter $poweredBy -Name name -ErrorAction SilentlyContinue) {
    Remove-WebConfigurationProperty @at -Filter 'system.webServer/httpProtocol/customHeaders' -Name '.' -AtElement @{ name = 'X-Powered-By' }
  }
}

# -IisConfig WebConfig: a web.config in the site folder. IIS only reads its
# <handlers> and <httpPlatform> once they are unlocked for this site.
function Set-WebConfigSettings {
  foreach ($section in 'system.webServer/handlers', $httpPlatform) {
    Set-WebConfiguration -Filter $section -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $SiteName -Metadata overrideMode -Value Allow
  }
  # web.config becomes the only source of the handler and httpPlatform settings.
  if (Get-WebConfigurationProperty @at -Filter $handlerXPath -Name name -ErrorAction SilentlyContinue) {
    Remove-WebConfigurationProperty @at -Filter 'system.webServer/handlers' -Name '.' -AtElement @{ name = 'httpPlatformHandler' }
  }
  try { Clear-WebConfiguration @at -Filter $httpPlatform } catch { }

  $esc = { param($value) [Security.SecurityElement]::Escape($(if ($value -is [bool]) { "$value".ToLower() } else { "$value" })) }
  $attributes = ($platformSettings.Keys | ForEach-Object { "$_=`"$(& $esc $platformSettings[$_])`"" }) -join ' '
  $variables = ($platformEnv.Keys | ForEach-Object {
      "        <environmentVariable name=`"$_`" value=`"$(& $esc $platformEnv[$_])`" />"
    }) -join "`r`n"
  $xml = @"
<?xml version="1.0" encoding="utf-8"?>
<!-- Written by deploy/iis/install-local.ps1 (-IisConfig WebConfig). Every install rewrites it. -->
<configuration>
  <system.webServer>
    <handlers>
      <remove name="httpPlatformHandler" />
      <add name="httpPlatformHandler" path="*" verb="*" modules="httpPlatformHandler" resourceType="Unspecified" />
    </handlers>
    <httpPlatform $attributes>
      <environmentVariables>
        <clear />
$variables
      </environmentVariables>
    </httpPlatform>
    <security>
      <requestFiltering removeServerHeader="true">
        <requestLimits maxAllowedContentLength="31457280" />
      </requestFiltering>
    </security>
    <httpProtocol>
      <customHeaders>
        <remove name="X-Powered-By" />
      </customHeaders>
    </httpProtocol>
  </system.webServer>
</configuration>
"@
  [IO.File]::WriteAllText($webConfigPath, $xml, (New-Object Text.UTF8Encoding $false))
}

# $null when /api/health answers 200, otherwise the reason. A 500.19 comes back
# at once with the lines of IIS's error page that name the refused setting.
function Get-SiteProblem {
  $problem = 'no answer'
  for ($i = 0; $i -lt 30; $i++) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $out = @(& curl.exe -s --max-time 10 -w "`n%{http_code}" "$appUrl/api/health") } finally { $ErrorActionPreference = $previous }
    $code = "$($out[-1])".Trim()
    if ($code -eq '200') { return $null }
    $body = ($out | Select-Object -SkipLast 1) -join ' '
    if ($code -eq '500' -and $body -match '500\.19') {
      $text = $body -replace '<[^>]+>', ' ' -replace '&nbsp;', ' ' -replace '&quot;', '"' -replace '&lt;', '<' -replace '&gt;', '>' -replace '\s+', ' '
      $next = 'Error Code|Config Error|Config File|Requested URL|Physical Path|Config Source|More Information'
      $details = foreach ($label in 'Error Code', 'Config Error', 'Config File', 'Config Source') {
        if ($text -match "$label\s*:? (.+?) ($next)") {
          $value = $Matches[1].Trim()
          "${label}: $(if ($value.Length -gt 300) { $value.Substring(0, 300) + '...' } else { $value })"
        }
      }
      return "HTTP 500.19 | $($details -join ' | ')"
    }
    $problem = if ($code -eq '000') { 'no answer' } else { "HTTP $code" }
    Start-Sleep -Seconds 2
  }
  $problem
}

$fallbackReason = $null
if ($IisConfig -eq 'WebConfig') {
  Write-Step "IIS settings for ${SiteName}: web.config"
  try {
    Set-WebConfigSettings
  } catch {
    $fallbackReason = "unlocking <handlers>/<httpPlatform> for $SiteName failed: $($_.Exception.Message)"
  }
}
if ($IisConfig -eq 'AppHost' -or $fallbackReason) {
  if ($fallbackReason) { Write-Warning "web.config method failed: $fallbackReason" }
  Write-Step "IIS settings for ${SiteName}: applicationHost.config"
  Set-AppHostSettings
}

# --- SQL Server login --------------------------------------------------------

$sqlServer = if ($settings['MSSQL_SERVER']) { $settings['MSSQL_SERVER'] } else { '.' }
$database = if ($settings['MSSQL_DATABASE']) { $settings['MSSQL_DATABASE'] } else { 'aidea' }
$isLocal = @('.', '(local)', 'localhost', '127.0.0.1', $env:COMPUTERNAME) -contains ($sqlServer -split '\\')[0]
if ($settings['MSSQL_USER']) {
  Write-Step 'SQL Server: using the SQL login from the settings file'
} elseif (-not $isLocal) {
  Write-Warning "MSSQL_SERVER=$sqlServer is not local: grant the computer account ($env:USERDOMAIN\$env:COMPUTERNAME`$) access to $database there."
} elseif (-not (Get-Command sqlcmd -ErrorAction SilentlyContinue)) {
  Write-Warning "sqlcmd not found: create a login and a db_datareader/db_datawriter/EXECUTE user for [$identity] in $database yourself."
} else {
  Write-Step "SQL Server: read/write access to $database for [$identity]"
  $login = $identity.Replace("'", "''")
  Invoke-Native { sqlcmd -S $sqlServer -E -C -b -Q "IF SUSER_ID(N'$login') IS NULL CREATE LOGIN [$login] FROM WINDOWS;" }
  Invoke-Native {
    sqlcmd -S $sqlServer -E -C -b -d $database -Q (
      "IF DATABASE_PRINCIPAL_ID(N'$login') IS NULL CREATE USER [$login] FOR LOGIN [$login]; " +
      "ALTER ROLE db_datareader ADD MEMBER [$login]; ALTER ROLE db_datawriter ADD MEMBER [$login]; " +
      "GRANT EXECUTE TO [$login];"
    )
  }
}

# --- Start -------------------------------------------------------------------

Write-Step 'Starting'
Start-SitePool
$problem = Get-SiteProblem

if ($problem -like 'HTTP 500.19*' -and (Test-Path $webConfigPath)) {
  $fallbackReason = "IIS refused it: $problem"
  Write-Warning "web.config method failed. $problem"
  Write-Step "IIS settings for ${SiteName}: switching to applicationHost.config"
  Stop-SitePool
  Set-AppHostSettings
  Start-SitePool
  $problem = Get-SiteProblem
}

$log = Get-ChildItem $logsDir -Filter 'node*.log' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime | Select-Object -Last 1
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
