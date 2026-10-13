<#
.SYNOPSIS
  Compiles AIdea into a self-contained folder for IIS (HttpPlatformHandler).

.DESCRIPTION
  Runs `next build` with NEXT_PUBLIC_APP_URL set to -AppUrl (Next.js bakes it
  into the bundles), then assembles dist\iis\aidea from the standalone server,
  the static assets and public\.

  The package also carries db\migrations and tools\migrate.cjs, so the target
  can apply migrations without npm.

  The package holds no settings or secrets: install-local.ps1 or
  deploy-production.ps1 keeps .env.production.local next to server.js on the
  target. Needs no admin rights, and can run while `npm run dev` is running
  (dev builds into .next\dev).

.EXAMPLE
  npm run build:iis
  npm run build:iis -- -Zip
  npm run build:iis -- -AppUrl http://localhost:8080
  npm run build:iis -- -AppUrl https://aidea.godrejindonesia.com -Zip   (production)
#>
[CmdletBinding()]
param(
  [string]$AppUrl = 'http://localhost:8080',
  [switch]$Zip
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$distDir = Join-Path $root 'dist\iis'
$out = Join-Path $distDir 'aidea'

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }

# Native commands write progress to stderr; under Windows PowerShell 5.1 with
# 'Stop' that would abort the script, so rely on the exit code instead.
function Invoke-Native([scriptblock]$Command, [int]$MaxExitCode = 0) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Command } finally { $ErrorActionPreference = $previous }
  if ($LASTEXITCODE -gt $MaxExitCode) { throw "Command failed (exit $LASTEXITCODE): $Command" }
}

# robocopy exit codes 0-7 mean success (8+ is a failure).
function Copy-Tree([string]$From, [string]$To) {
  Invoke-Native { robocopy $From $To /E /NFL /NDL /NJH /NJS /NP /R:2 /W:2 | Out-Null } -MaxExitCode 7
}

$nodeVersion = (& node -v).Trim()
if ($nodeVersion -notmatch '^v24\.') { throw "Node 24 is required to build for this server (found $nodeVersion)." }
if (-not (Test-Path (Join-Path $root 'node_modules\next'))) { throw 'node_modules is missing: run npm ci first.' }

$AppUrl = $AppUrl.TrimEnd('/')
if (-not [Uri]::IsWellFormedUriString($AppUrl, 'Absolute')) { throw "-AppUrl is not an absolute URL: $AppUrl" }

$standalone = Join-Path $root '.next\standalone'
if (Test-Path $standalone) { Remove-Item $standalone -Recurse -Force }

Write-Step "Building with NEXT_PUBLIC_APP_URL=$AppUrl (node $nodeVersion)"
Push-Location $root
try {
  # The process environment wins over .env.local, so dev settings stay as they are.
  $env:NEXT_PUBLIC_APP_URL = $AppUrl
  Invoke-Native { npm run build }
} finally {
  Remove-Item Env:NEXT_PUBLIC_APP_URL -ErrorAction SilentlyContinue
  Pop-Location
}

if (-not (Test-Path (Join-Path $standalone 'server.js'))) {
  throw 'server.js is not at .next\standalone\server.js. Check output: "standalone" in next.config.mjs, and that no lockfile in a parent folder moved the tracing root.'
}

# A standalone build holds only these at its root. Anything else means file
# tracing pulled in project files (e.g. a server-side process.cwd() path) and
# would ship them, secrets included, so refuse to package it.
$expected = 'server.js', 'package.json', 'node_modules', '.next'
$unexpected = Get-ChildItem $standalone -Force | Where-Object { $expected -notcontains $_.Name }
if ($unexpected) {
  throw ("File tracing copied project files into the build: {0}. Find the server-side path that uses process.cwd() and mark it /* turbopackIgnore: true */." -f (($unexpected | Select-Object -ExpandProperty Name) -join ', '))
}

Write-Step "Assembling $out"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $out | Out-Null
Copy-Tree $standalone $out
# The standalone server does not include these; it serves them itself from here.
Copy-Tree (Join-Path $root '.next\static') (Join-Path $out '.next\static')
Copy-Tree (Join-Path $root 'public') (Join-Path $out 'public')

# Native code loaded at runtime. File tracing normally includes it; copy it
# from node_modules if a package or its Windows binary was missed.
$nativePackages = @(
  @{ Package = 'node_modules\msnodesqlv8'; Binary = 'node_modules\msnodesqlv8\prebuilds\win32-x64' },
  @{ Package = 'node_modules\sharp'; Binary = 'node_modules\@img\sharp-win32-x64' }
)
foreach ($native in $nativePackages) {
  foreach ($rel in $native.Package, $native.Binary) {
    if (-not (Test-Path (Join-Path $out $rel)) -and (Test-Path (Join-Path $root $rel))) {
      Copy-Tree (Join-Path $root $rel) (Join-Path $out $rel)
      Write-Warning "File tracing missed $rel; copied it from node_modules."
    }
  }
}
if (-not (Test-Path (Join-Path $out 'node_modules\msnodesqlv8\prebuilds\win32-x64\msnodesqlv8.node'))) {
  throw 'msnodesqlv8.node (the Windows SQL Server driver) is missing from the package.'
}

# Migrations and their runner (scripts/migrate.ts as one file), so the server
# can apply them without npm: node tools\migrate.cjs. mssql and the native
# driver come from the package's own node_modules; import() is turned into
# require() so 'mssql/msnodesqlv8' resolves as it does under tsx.
Write-Step 'Bundling the migration runner'
Copy-Tree (Join-Path $root 'db\migrations') (Join-Path $out 'db\migrations')
Push-Location $root
try {
  Invoke-Native {
    node node_modules\esbuild\bin\esbuild scripts\migrate.ts --bundle --platform=node --format=cjs --target=node24 --supported:dynamic-import=false `
      --external:mssql --external:msnodesqlv8 --log-level=warning --outfile=$(Join-Path $out 'tools\migrate.cjs')
  }
} finally { Pop-Location }
foreach ($module in 'mssql', 'msnodesqlv8') {
  if (-not (Test-Path (Join-Path $out "node_modules\$module\package.json"))) {
    throw "node_modules\$module is missing from the package, so tools\migrate.cjs could not run."
  }
}
$migrations = @(Get-ChildItem (Join-Path $out 'db\migrations') -Filter '*.sql' | Sort-Object Name | Select-Object -ExpandProperty Name)

# Settings and secrets belong on the server, never in the package.
Get-ChildItem $out -Filter '.env*' -File -Force | Remove-Item -Force

$commit = try { (& git -C $root rev-parse --short HEAD) } catch { '' }
[ordered]@{
  appUrl  = $AppUrl
  node    = $nodeVersion
  next    = (Get-Content (Join-Path $root 'node_modules\next\package.json') -Raw | ConvertFrom-Json).version
  commit  = "$commit"
  builtAt = (Get-Date).ToString('s')
  migrations = $migrations
} | ConvertTo-Json | Set-Content (Join-Path $out 'build-info.json') -Encoding ASCII

$sizeMb = [math]::Round(((Get-ChildItem $out -Recurse -File -Force | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Step "Package ready: $out ($sizeMb MB)"

if ($Zip) {
  $zipPath = Join-Path $distDir ("aidea-iis-{0}.zip" -f (Get-Date -Format 'yyyyMMdd-HHmm'))
  # Windows' own bsdtar: a GNU tar earlier on PATH (Git) can't write zips.
  $tar = Join-Path $env:windir 'System32\tar.exe'
  Invoke-Native { & $tar -a -c -f $zipPath -C $out . }
  Write-Step "Zip ready: $zipPath"
}

Write-Host ''
if ($AppUrl -like 'https://*') {
  Write-Host 'Next: copy the zip and deploy\iis\deploy-production.* to the server, then run there'
  Write-Host "  deploy-production.cmd -Package <zip> -HostName $(([Uri]$AppUrl).Host)"
} else {
  Write-Host 'Next: from the project folder, run'
  Write-Host '  deploy\iis\install-local.cmd -LdapUrl ldaps://<domain controller>:636'
}
