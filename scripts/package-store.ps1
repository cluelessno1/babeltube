# Build a Chrome Web Store upload ZIP (files at archive root, no .git).
# Output: babeltube-v{version}.zip (version read from manifest.json).
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$manifestPath = Join-Path $repoRoot 'manifest.json'
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
if (-not $version) {
  throw "manifest.json has no version field"
}

$staging = Join-Path $env:TEMP 'babeltube-store'
$outZip = Join-Path $repoRoot "babeltube-v$version.zip"

$includes = @(
  'manifest.json',
  'background.js',
  'content_scripts',
  'popup',
  'options',
  'icons'
)

Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $staging | Out-Null

foreach ($item in $includes) {
  $src = Join-Path $repoRoot $item
  if (-not (Test-Path $src)) {
    throw "Missing required path: $src"
  }
  Copy-Item $src -Destination $staging -Recurse -Force
}

if (Test-Path $outZip) { Remove-Item $outZip -Force }
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $outZip -Force

Write-Host "Created: $outZip (manifest version $version)"
Write-Host "Staging folder (for Load unpacked test): $staging"
Write-Host "Tip: Publish a GitHub Release to attach this ZIP via CI (see .github/workflows/release.yml)."
