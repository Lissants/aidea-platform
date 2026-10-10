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

# Straight to IIS on this server, whatever DNS says; -k because the
# certificate is for the host name, checked by the deployment instead.
& (Join-Path $env:windir 'System32\curl.exe') -s -k --fail --max-time 120 `
  --resolve "${HostName}:443:127.0.0.1" -H "Authorization: Bearer $secret" `
  "https://$HostName/api/cron/voting-notifications"
exit $LASTEXITCODE
