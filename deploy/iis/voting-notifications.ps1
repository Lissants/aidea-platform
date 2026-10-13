<#
.SYNOPSIS
  Sends due voting notifications: calls /api/cron/voting-notifications once.

.DESCRIPTION
  Run hourly by the "AIdea voting notifications" scheduled task that
  deploy-production.ps1 registers (as SYSTEM). It reads CRON_SECRET from the
  site's settings file each time, so the task itself holds no secret. Each
  notification is sent only once, so extra runs are harmless.
#>
param(
  [Parameter(Mandatory)] [string]$EnvFile,
  [Parameter(Mandatory)] [string]$HostName
)

$line = Get-Content $EnvFile | Where-Object { $_ -match '^\s*CRON_SECRET\s*=' } | Select-Object -Last 1
$secret = ("$line" -replace '^\s*CRON_SECRET\s*=\s*', '').Trim().Trim('"', "'")
if (-not $secret) { exit 0 }

# Straight to IIS on this server, whatever DNS says. The certificate is
# checked by the deployment instead. common.ps1 is copied next to this file.
. (Join-Path $PSScriptRoot 'common.ps1')
$response = Invoke-SiteRequest "https://$HostName/api/cron/voting-notifications" -Loopback `
  -Headers @{ Authorization = "Bearer $secret" } -TimeoutSec 120
if ($response.Status -ge 200 -and $response.Status -lt 300) { exit 0 }
exit 1
