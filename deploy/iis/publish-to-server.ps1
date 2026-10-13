<#
.SYNOPSIS
  Rebuilds AIdea for production and copies it to the production server, ready
  to deploy with one double-click there.

.DESCRIPTION
  Runs on a developer PC, without administrator rights:
    1. warns about uncommitted git changes (the package is named after the commit);
    2. runs `npm run typecheck` and `npm run test` (skip with -SkipChecks);
    3. builds the package (build-package.ps1 -AppUrl <AppUrl> -Zip; skip with
       -SkipBuild to reuse the newest dist\iis\aidea-iis-*.zip);
    4. copies the zip and this folder (as deploy-iis) to \\<Server>\<DropDir>,
       by default C:\aidea\drop on the server, keeping the newest -KeepZips zips;
    5. writes DEPLOY-LATEST.cmd in that folder, which runs
       deploy-iis\deploy-production.cmd -Package <this zip>.

  It does not deploy: Remote Desktop to the server and double-click
  C:\aidea\drop\DEPLOY-LATEST.cmd. Migrations then run as your own Windows
  login on the server, which SQL Server on its separate machine accepts.

.EXAMPLE
  npm run publish:prod
.EXAMPLE
  deploy\iis\publish-to-server.cmd -SkipChecks
.EXAMPLE
  deploy\iis\publish-to-server.cmd -Credential (Get-Credential GODREJ\admin.user)
#>
[CmdletBinding()]
param(
  [string]$Server = '10.21.10.189',
  [string]$AppUrl = 'https://aidea.godrejindonesia.com',
  # Share path on -Server; C$\aidea\drop is C:\aidea\drop on the server.
  [string]$DropDir = 'C$\aidea\drop',
  # Server administrator account, asked for only when the share can't be opened as you.
  [pscredential]$Credential,
  [switch]$SkipChecks,
  [switch]$SkipBuild,
  # Continue without asking when there are uncommitted changes.
  [switch]$Force,
  [int]$KeepZips = 3
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$distDir = Join-Path $root 'dist\iis'

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }

# Native commands write progress to stderr; under Windows PowerShell 5.1 with
# 'Stop' that would abort the script, so rely on the exit code instead.
function Invoke-Native([scriptblock]$Command) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Command } finally { $ErrorActionPreference = $previous }
  if ($LASTEXITCODE -ne 0) { throw "Command failed (exit $LASTEXITCODE): $Command" }
}

Push-Location $root
$drive = $null
try {
  # --- 1. Uncommitted changes ------------------------------------------------
  $dirty = @(& git status --porcelain 2>$null)
  if ($dirty.Count -gt 0) {
    Write-Host 'Uncommitted changes will be built into the package, under the last commit''s name:' -ForegroundColor Yellow
    $dirty | Select-Object -First 20 | ForEach-Object { Write-Host "  $_" }
    if ($dirty.Count -gt 20) { Write-Host "  ... and $($dirty.Count - 20) more" }
    if (-not $Force -and (Read-Host 'Continue? (y/N)') -notmatch '^(y|yes)$') { throw 'Stopped: commit your changes first, or run again with -Force.' }
  }

  # --- 2. Checks -------------------------------------------------------------
  if ($SkipChecks) {
    Write-Step 'Skipping typecheck and tests (-SkipChecks)'
  } else {
    Write-Step 'Typecheck'
    Invoke-Native { npm run typecheck }
    Write-Step 'Unit tests'
    Invoke-Native { npm run test }
  }

  # --- 3. Build --------------------------------------------------------------
  if ($SkipBuild) {
    Write-Step 'Reusing the newest package (-SkipBuild)'
  } else {
    & (Join-Path $PSScriptRoot 'build-package.ps1') -AppUrl $AppUrl -Zip
  }
  $zip = Get-ChildItem (Join-Path $distDir 'aidea-iis-*.zip') -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $zip) { throw "No package in $distDir. Run without -SkipBuild." }
  Write-Step "Package: $($zip.Name) ($([math]::Round($zip.Length / 1MB)) MB)"

  # --- 4. Server share -------------------------------------------------------
  $shareRoot = "\\$Server\$($DropDir.Split('\')[0])"
  $dropRest = ($DropDir.Split('\') | Select-Object -Skip 1) -join '\'
  if (-not $Credential -and -not (Test-Path $shareRoot)) {
    Write-Host "Can't open $shareRoot as $env:USERDOMAIN\$env:USERNAME." -ForegroundColor Yellow
    $Credential = Get-Credential -Message "Administrator account on $Server"
  }
  if ($Credential) {
    $drive = New-PSDrive -Name ('AIdeaDrop{0}' -f (Get-Random)) -PSProvider FileSystem -Root $shareRoot -Credential $Credential
    $drop = "$($drive.Name):\$dropRest"
  } else {
    $drop = "$shareRoot\$dropRest"
  }
  Write-Step "Copying to $shareRoot\$dropRest"
  New-Item -ItemType Directory -Force -Path $drop | Out-Null

  # --- 5. Copy ---------------------------------------------------------------
  Copy-Item $zip.FullName -Destination $drop -Force
  # Replace the scripts as a whole so they always match this build.
  $scripts = Join-Path $drop 'deploy-iis'
  if (Test-Path $scripts) { Remove-Item $scripts -Recurse -Force }
  New-Item -ItemType Directory -Path $scripts | Out-Null
  Get-ChildItem $PSScriptRoot -File | Where-Object { $_.Extension -in '.ps1', '.cmd', '.md', '.example' } |
    Copy-Item -Destination $scripts -Force

  # --- 6. DEPLOY-LATEST.cmd --------------------------------------------------
  $launcher = @(
    '@echo off'
    "rem Written by publish-to-server.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm'). Deploys $($zip.Name)."
    'rem Extra arguments are passed through, e.g. DEPLOY-LATEST.cmd -SkipDbBackup'
    'rem deploy-production.cmd keeps the window open when this is double-clicked.'
    "call `"%~dp0deploy-iis\deploy-production.cmd`" -Package `"%~dp0$($zip.Name)`" %*"
  )
  Set-Content -Path (Join-Path $drop 'DEPLOY-LATEST.cmd') -Value $launcher -Encoding Ascii

  # --- 7. Old zips -----------------------------------------------------------
  Get-ChildItem (Join-Path $drop 'aidea-iis-*.zip') | Sort-Object LastWriteTime -Descending |
    Select-Object -Skip $KeepZips | ForEach-Object {
      Write-Host "  removing old package $($_.Name)"
      Remove-Item $_.FullName -Force
    }

  # --- 8. Next steps ---------------------------------------------------------
  $serverDrop = ($DropDir -replace '^([A-Za-z])\$', '$1:')
  Write-Host ''
  Write-Host "Copied $($zip.Name) to $Server." -ForegroundColor Green
  Write-Host 'Next, to deploy:'
  Write-Host "  1. Remote Desktop to $Server with your administrator account."
  Write-Host "  2. Open $serverDrop and double-click DEPLOY-LATEST.cmd (approve the UAC prompt)."
  Write-Host "  3. Check https://$(([Uri]$AppUrl).Host) and the log in C:\aidea\deploy-logs."
  Write-Host 'To go back to the previous release:'
  Write-Host "  $serverDrop\deploy-iis\deploy-production.cmd -Rollback"
} finally {
  if ($drive) { Remove-PSDrive $drive.Name -ErrorAction SilentlyContinue }
  Pop-Location
}
