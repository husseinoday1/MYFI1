param(
  [Parameter(Mandatory=$false)]
  [string]$RepoPath = "."
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoPath = (Resolve-Path $RepoPath).Path

$files = @(
  "src/lib/financialForecast.js",
  "src/lib/localIntelligence.js",
  "src/utils/calc.js",
  "src/components/NewItemModal.js",
  "tests/forecasting-fix.test.mjs",
  "tests/run-forecasting-fix.cjs"
)

foreach ($relative in $files) {
  $source = Join-Path $PackageRoot $relative
  $target = Join-Path $RepoPath $relative
  $targetDir = Split-Path -Parent $target
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  Copy-Item -Force $source $target
  Write-Host "Updated $relative"
}

Push-Location $RepoPath
try {
  git apply --check (Join-Path $PackageRoot "patches/ReportsScreen.patch")
  git apply (Join-Path $PackageRoot "patches/ReportsScreen.patch")
  Write-Host "Patched src/screens/ReportsScreen.js"

  git apply --check (Join-Path $PackageRoot "patches/managementSlice.patch")
  git apply (Join-Path $PackageRoot "patches/managementSlice.patch")
  Write-Host "Patched src/store/slices/managementSlice.js"

  Write-Host ""
  Write-Host "MYFI forecast fix applied successfully."
  Write-Host "Run: npm run test:logic"
  Write-Host "Run: node tests/run-forecasting-fix.cjs"
  Write-Host "Then restart Expo with cache clear: npx expo start -c"
}
finally {
  Pop-Location
}
