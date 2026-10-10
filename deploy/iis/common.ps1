<#
  Helpers shared by install-local.ps1 and deploy-production.ps1. Dot-source it:
    . (Join-Path $PSScriptRoot 'common.ps1')
#>

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

function Test-Administrator {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Re-launches the calling script elevated (UAC prompt), waits for it, prints
# what the elevated run did, then exits with its exit code. Returns at once when
# already elevated.
function Invoke-SelfElevation {
  param(
    [Parameter(Mandatory)] [hashtable]$BoundParameters,
    [Parameter(Mandatory)] [string]$ScriptPath,
    [Parameter(Mandatory)] [string]$LogDir,
    [Parameter(Mandatory)] [string]$LogPrefix
  )
  if (Test-Administrator) { return }
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  $transcript = Join-Path $LogDir ('{0}-{1}.log' -f $LogPrefix, (Get-Date -Format 'yyyyMMdd-HHmmss'))
  $forward = foreach ($param in $BoundParameters.GetEnumerator()) {
    if ($param.Value -is [System.Management.Automation.SwitchParameter]) {
      if ($param.Value.IsPresent) { "-$($param.Key)" }
    } else {
      "-$($param.Key)"; "`"$($param.Value)`""
    }
  }
  $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$ScriptPath`"") + $forward + @('-TranscriptPath', "`"$transcript`"")
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

# --- Backup ------------------------------------------------------------------

# Snapshot of all IIS configuration, plus the site folder (logs and cache
# excluded). Prints both locations with their restore commands.
function Backup-AIdeaSite {
  param(
    [Parameter(Mandatory)] [string]$SiteName,
    [Parameter(Mandatory)] [string]$SitePath,
    [Parameter(Mandatory)] [string]$BackupRoot,
    [Parameter(Mandatory)] [string]$Stamp
  )
  $iisBackup = "$($SiteName.ToLower())-$Stamp"
  Backup-WebConfiguration -Name $iisBackup | Out-Null
  Write-Host "  IIS configuration : $env:windir\System32\inetsrv\backup\$iisBackup"
  Write-Host "    restore with    : Restore-WebConfiguration -Name $iisBackup   (all IIS sites, as they are now)"
  if (Test-Path (Join-Path $SitePath 'server.js')) {
    # /COPY:DATS keeps .env.production.local readable by administrators only.
    $siteBackup = Join-Path $BackupRoot "$Stamp\site"
    Invoke-Native {
      robocopy $SitePath $siteBackup /E /COPY:DATS /NFL /NDL /NJH /NJS /NP /R:1 /W:1 `
        /XD (Join-Path $SitePath 'logs') (Join-Path $SitePath '.next\cache')
    } -MaxExitCode 7
    Write-Host "  Site folder       : $siteBackup"
    Write-Host "    restore with    : robocopy `"$siteBackup`" `"$SitePath`" /MIR /COPY:DATS /XD `"$SitePath\logs`" `"$SitePath\.next\cache`""
  }
}

# --- App pool ----------------------------------------------------------------

# Creates or updates the app pool: No Managed Code, always running, never idle.
function Set-AIdeaAppPool([string]$SiteName) {
  $poolPath = "IIS:\AppPools\$SiteName"
  if (-not (Test-Path $poolPath)) { New-WebAppPool -Name $SiteName | Out-Null }
  Set-ItemProperty $poolPath -Name managedRuntimeVersion -Value ''
  Set-ItemProperty $poolPath -Name startMode -Value 'AlwaysRunning'
  Set-ItemProperty $poolPath -Name processModel.identityType -Value 'ApplicationPoolIdentity'
  Set-ItemProperty $poolPath -Name processModel.idleTimeout -Value ([TimeSpan]::Zero)
  Set-ItemProperty $poolPath -Name processModel.loadUserProfile -Value $true
}

function Stop-SitePool([string]$SiteName, [string]$ServerJs) {
  # Node holds msnodesqlv8.node open, so wait until it has exited too.
  if ((Get-WebAppPoolState -Name $SiteName).Value -ne 'Stopped') { Stop-WebAppPool -Name $SiteName }
  for ($i = 0; $i -lt 30; $i++) {
    $running = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
      Where-Object { $_.CommandLine -and $_.CommandLine.Contains($ServerJs) }
    if ((Get-WebAppPoolState -Name $SiteName).Value -eq 'Stopped' -and -not $running) { return }
    Start-Sleep -Seconds 1
  }
}

function Start-SitePool([string]$SiteName) {
  if ((Get-WebAppPoolState -Name $SiteName).Value -ne 'Started') { Start-WebAppPool -Name $SiteName }
  if ((Get-WebsiteState -Name $SiteName).Value -ne 'Started') { Start-Website -Name $SiteName }
}

# Mirrors a package into the site folder, keeping logs, .next\cache and the
# settings file.
function Copy-AIdeaPackage([string]$Package, [string]$SitePath) {
  New-Item -ItemType Directory -Force -Path $SitePath | Out-Null
  $envFile = Join-Path $SitePath '.env.production.local'
  $savedEnv = if (Test-Path $envFile) { [IO.File]::ReadAllText($envFile) } else { $null }
  Invoke-Native {
    robocopy $Package $SitePath /MIR /NFL /NDL /NJH /NJS /NP /R:2 /W:2 `
      /XD (Join-Path $SitePath 'logs') (Join-Path $SitePath '.next\cache') `
      /XF '.env.production.local'
  } -MaxExitCode 7
  if ($savedEnv -and -not (Test-Path $envFile)) { [IO.File]::WriteAllText($envFile, $savedEnv) }
}

# --- IIS settings ------------------------------------------------------------

# The HttpPlatformHandler settings for the site: node.exe server.js on the port
# IIS picks, on loopback only, logging to <site>\logs\node_*.log.
function Get-PlatformSettings([string]$NodeExe, [string]$SitePath) {
  [ordered]@{
    processPath       = $NodeExe
    arguments         = (Join-Path $SitePath 'server.js')
    startupTimeLimit  = 60
    startupRetryCount = 3
    requestTimeout    = '00:05:00'
    stdoutLogEnabled  = $true
    stdoutLogFile     = (Join-Path $SitePath 'logs\node')
  }
}

function Get-PlatformEnv([hashtable]$Extra = @{}) {
  $vars = [ordered]@{ PORT = '%HTTP_PLATFORM_PORT%'; HOSTNAME = '127.0.0.1'; NODE_ENV = 'production' }
  foreach ($key in $Extra.Keys) { $vars[$key] = $Extra[$key] }
  $vars
}

# IIS settings in applicationHost.config, under <location path="$SiteName">.
# Section locks only restrict web.config files, so this always works.
function Set-AppHostSettings {
  param(
    [Parameter(Mandatory)] [string]$SiteName,
    [Parameter(Mandatory)] [string]$SitePath,
    [Parameter(Mandatory)] [System.Collections.IDictionary]$PlatformSettings,
    [Parameter(Mandatory)] [System.Collections.IDictionary]$PlatformEnv
  )
  $at = @{ PSPath = 'MACHINE/WEBROOT/APPHOST'; Location = $SiteName }
  $handlerXPath = "system.webServer/handlers/add[@name='httpPlatformHandler']"
  $httpPlatform = 'system.webServer/httpPlatform'
  Remove-Item (Join-Path $SitePath 'web.config') -Force -ErrorAction SilentlyContinue
  if (-not (Get-WebConfigurationProperty @at -Filter $handlerXPath -Name name -ErrorAction SilentlyContinue)) {
    Add-WebConfigurationProperty @at -Filter 'system.webServer/handlers' -Name '.' -Value @{
      name = 'httpPlatformHandler'; path = '*'; verb = '*'; modules = 'httpPlatformHandler'; resourceType = 'Unspecified'
    }
  }
  foreach ($name in $PlatformSettings.Keys) {
    Set-WebConfigurationProperty @at -Filter $httpPlatform -Name $name -Value $PlatformSettings[$name]
  }
  foreach ($name in $PlatformEnv.Keys) {
    $existing = "$httpPlatform/environmentVariables/environmentVariable[@name='$name']"
    if (Get-WebConfigurationProperty @at -Filter $existing -Name name -ErrorAction SilentlyContinue) {
      Set-WebConfigurationProperty @at -Filter $existing -Name value -Value $PlatformEnv[$name]
    } else {
      Add-WebConfigurationProperty @at -Filter "$httpPlatform/environmentVariables" -Name '.' -Value @{ name = $name; value = $PlatformEnv[$name] }
    }
  }
  Set-WebConfigurationProperty @at -Filter 'system.webServer/security/requestFiltering/requestLimits' -Name maxAllowedContentLength -Value 31457280
  Set-WebConfigurationProperty @at -Filter 'system.webServer/security/requestFiltering' -Name removeServerHeader -Value $true
  $poweredBy = "system.webServer/httpProtocol/customHeaders/add[@name='X-Powered-By']"
  if (Get-WebConfigurationProperty @at -Filter $poweredBy -Name name -ErrorAction SilentlyContinue) {
    Remove-WebConfigurationProperty @at -Filter 'system.webServer/httpProtocol/customHeaders' -Name '.' -AtElement @{ name = 'X-Powered-By' }
  }
}

# IIS settings in a web.config in the site folder. IIS only reads its
# <handlers> and <httpPlatform> once they are unlocked for this site.
function Set-WebConfigSettings {
  param(
    [Parameter(Mandatory)] [string]$SiteName,
    [Parameter(Mandatory)] [string]$SitePath,
    [Parameter(Mandatory)] [System.Collections.IDictionary]$PlatformSettings,
    [Parameter(Mandatory)] [System.Collections.IDictionary]$PlatformEnv,
    [string]$WrittenBy = 'deploy/iis'
  )
  $at = @{ PSPath = 'MACHINE/WEBROOT/APPHOST'; Location = $SiteName }
  $handlerXPath = "system.webServer/handlers/add[@name='httpPlatformHandler']"
  $httpPlatform = 'system.webServer/httpPlatform'
  foreach ($section in 'system.webServer/handlers', $httpPlatform) {
    Set-WebConfiguration -Filter $section -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $SiteName -Metadata overrideMode -Value Allow
  }
  # web.config becomes the only source of the handler and httpPlatform settings.
  if (Get-WebConfigurationProperty @at -Filter $handlerXPath -Name name -ErrorAction SilentlyContinue) {
    Remove-WebConfigurationProperty @at -Filter 'system.webServer/handlers' -Name '.' -AtElement @{ name = 'httpPlatformHandler' }
  }
  try { Clear-WebConfiguration @at -Filter $httpPlatform } catch { }

  $esc = { param($value) [Security.SecurityElement]::Escape($(if ($value -is [bool]) { "$value".ToLower() } else { "$value" })) }
  $attributes = ($PlatformSettings.Keys | ForEach-Object { "$_=`"$(& $esc $PlatformSettings[$_])`"" }) -join ' '
  $variables = ($PlatformEnv.Keys | ForEach-Object {
      "        <environmentVariable name=`"$_`" value=`"$(& $esc $PlatformEnv[$_])`" />"
    }) -join "`r`n"
  $xml = @"
<?xml version="1.0" encoding="utf-8"?>
<!-- Written by $WrittenBy (-IisConfig WebConfig). Every install rewrites it. -->
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
  [IO.File]::WriteAllText((Join-Path $SitePath 'web.config'), $xml, (New-Object Text.UTF8Encoding $false))
}

# --- Checks ------------------------------------------------------------------

# One HTTP/1.0 request, without curl.exe (Windows Server 2016 has none).
# -Loopback connects to 127.0.0.1 but still sends the URL's host name as Host
# header and TLS SNI, like curl --resolve. The certificate is never enforced:
# Trusted says whether this server would trust it. Status is 0 when nothing
# answered (Error says why).
function Invoke-SiteRequest([string]$Url, [switch]$Loopback, [hashtable]$Headers = @{}, [int]$TimeoutSec = 15) {
  $uri = [Uri]$Url
  $result = [pscustomobject]@{ Status = 0; Headers = @{}; Body = ''; Trusted = $false; Error = $null }
  $client = New-Object Net.Sockets.TcpClient
  try {
    $target = if ($Loopback) { '127.0.0.1' } else { $uri.DnsSafeHost }
    $connect = $client.BeginConnect($target, $uri.Port, $null, $null)
    if (-not $connect.AsyncWaitHandle.WaitOne($TimeoutSec * 1000)) { throw "No answer from ${target}:$($uri.Port)." }
    $client.EndConnect($connect)
    $client.ReceiveTimeout = $TimeoutSec * 1000
    $client.SendTimeout = $TimeoutSec * 1000
    $stream = $client.GetStream()
    if ($uri.Scheme -eq 'https') {
      $tls = @{ Errors = $null }
      $accept = { param($source, $certificate, $chain, $errors) $tls.Errors = $errors; $true }.GetNewClosure()
      $ssl = New-Object Net.Security.SslStream($stream, $false, [Net.Security.RemoteCertificateValidationCallback]$accept)
      $ssl.AuthenticateAsClient($uri.DnsSafeHost, $null, [Security.Authentication.SslProtocols]::Tls12, $false)
      $result.Trusted = $tls.Errors -eq [Net.Security.SslPolicyErrors]::None
      $stream = $ssl
    }
    $lines = @("GET $($uri.PathAndQuery) HTTP/1.0", "Host: $($uri.Authority)", 'Connection: close')
    foreach ($name in $Headers.Keys) { $lines += "${name}: $($Headers[$name])" }
    $request = [Text.Encoding]::ASCII.GetBytes(($lines -join "`r`n") + "`r`n`r`n")
    $stream.Write($request, 0, $request.Length)
    $stream.Flush()
    $buffer = New-Object byte[] 8192
    $memory = New-Object IO.MemoryStream
    try {
      while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) { $memory.Write($buffer, 0, $read) }
    } catch [IO.IOException] {
      # Servers may end TLS without a close_notify; keep what arrived.
      if (-not $memory.Length) { throw }
    }
    $raw = [Text.Encoding]::UTF8.GetString($memory.ToArray())
    $split = $raw.IndexOf("`r`n`r`n")
    $head = if ($split -ge 0) { $raw.Substring(0, $split) } else { $raw }
    if ($split -ge 0) { $result.Body = $raw.Substring($split + 4) }
    $headLines = @($head -split "`r`n")
    if ($headLines[0] -match '^HTTP/\S+\s+(\d{3})') { $result.Status = [int]$Matches[1] }
    foreach ($line in $headLines | Select-Object -Skip 1) {
      if ($line -match '^([A-Za-z0-9-]+):\s*(.*)$') { $result.Headers[$Matches[1].ToLower()] = $Matches[2].Trim() }
    }
  } catch {
    $result.Error = $_.Exception.Message
  } finally {
    $client.Close()
  }
  $result
}

# $null when $Url answers 200, otherwise the reason. A 500.19 comes back at once
# with the lines of IIS's error page that name the refused setting. -Loopback
# reaches a host name on this server, whatever DNS says.
function Get-SiteProblem([string]$Url, [switch]$Loopback) {
  $problem = 'no answer'
  for ($i = 0; $i -lt 30; $i++) {
    $response = Invoke-SiteRequest $Url -Loopback:$Loopback -TimeoutSec 10
    $code = "$($response.Status)"
    if ($code -eq '200') { return $null }
    $body = $response.Body
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
    $problem = if ($code -eq '0') { 'no answer' } else { "HTTP $code" }
    Start-Sleep -Seconds 2
  }
  $problem
}

# The newest node_*.log in $LogsDir, or $null.
function Get-NewestNodeLog([string]$LogsDir) {
  Get-ChildItem $LogsDir -Filter 'node*.log' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime | Select-Object -Last 1
}

# --- SQL Server --------------------------------------------------------------

# Gives $Identity (a Windows login) read/write/EXECUTE on $Database when SQL
# Server is on this machine; otherwise says what a DBA must do.
function Grant-SqlAppAccess {
  param(
    [Parameter(Mandatory)] [hashtable]$Settings,
    [Parameter(Mandatory)] [string]$Identity,
    # The Windows login a remote SQL Server sees for $Identity.
    [string]$RemoteLogin = "$env:USERDOMAIN\$env:COMPUTERNAME`$"
  )
  $sqlServer = if ($Settings['MSSQL_SERVER']) { $Settings['MSSQL_SERVER'] } else { '.' }
  $database = if ($Settings['MSSQL_DATABASE']) { $Settings['MSSQL_DATABASE'] } else { 'aidea' }
  $isLocal = @('.', '(local)', 'localhost', '127.0.0.1', $env:COMPUTERNAME) -contains ($sqlServer -split '[\\,]')[0].Split('.')[0]
  $grant = { param($login)
    "IF SUSER_ID(N'$login') IS NULL CREATE LOGIN [$login] FROM WINDOWS;`n" +
    "USE [$database];`n" +
    "IF DATABASE_PRINCIPAL_ID(N'$login') IS NULL CREATE USER [$login] FOR LOGIN [$login];`n" +
    "ALTER ROLE db_datareader ADD MEMBER [$login]; ALTER ROLE db_datawriter ADD MEMBER [$login];`n" +
    "GRANT EXECUTE TO [$login];"
  }
  if ($Settings['MSSQL_USER']) {
    Write-Step 'SQL Server: the app uses the SQL login from the settings file'
  } elseif (-not $isLocal) {
    Write-Warning ("MSSQL_SERVER=$sqlServer is another machine. The app pool reaches it as this computer's account. Ask the DBA to run, once:`n" +
      (& $grant $RemoteLogin.Replace("'", "''")))
  } elseif (-not (Get-Command sqlcmd -ErrorAction SilentlyContinue)) {
    Write-Warning ("sqlcmd not found: run this on $sqlServer yourself:`n" + (& $grant $Identity.Replace("'", "''")))
  } else {
    Write-Step "SQL Server: read/write access to $database for [$Identity]"
    $query = & $grant $Identity.Replace("'", "''")
    Invoke-Native { sqlcmd -S $sqlServer -E -C -b -Q $query }
  }
}
