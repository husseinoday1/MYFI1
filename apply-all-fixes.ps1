param(
  [Parameter(Mandatory=$false)]
  [string]$RepoPath = ".",
  [switch]$SkipProjectTests,
  [switch]$SkipAndroidVerify
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoPath = (Resolve-Path $RepoPath).Path

Write-Host "MYFI integrated repair package"
Write-Host "Target: $RepoPath"

$fixFiles = @(
  "src/screens/HistoryScreen.js",
  "src/components/AddTransModal.js",
  "src/screens/TrackersLabScreen.js",
  "src/store/slices/managementSlice.js",
  "src/store/slices/trackersSlice.js",
  "src/store/slices/transactionsSlice.js",
  "src/store/slices/dataSlice.js",
  "src/store/slices/useSyncSlice.js",
  "src/lib/secureVault.js",
  "src/lib/wallets.js",
  "src/lib/modules.js",
  "src/utils/calc.js",
  "src/lib/trackerLifecycle.js",
  "tests/lifecycle-reset-wallet-search.test.cjs"
)

Push-Location $RepoPath
try {
  if (!(Test-Path "package.json")) { throw "package.json not found. Point -RepoPath to the MYFI1 repository root." }

  $status = git status --porcelain
  if ($LASTEXITCODE -ne 0) { throw "The target folder is not a valid Git repository." }
  if ($status) {
    Write-Warning "The repository has local changes. The fixer edits only the files listed in README-AR.md; commit/stash first if you want a clean Git rollback point."
  }

  $backupRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("MYFI1-fix-backup-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
  $existed = @{}
  foreach ($relative in $fixFiles) {
    $source = Join-Path $RepoPath $relative
    $existed[$relative] = Test-Path $source
    if ($existed[$relative]) {
      $backup = Join-Path $backupRoot $relative
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup) | Out-Null
      Copy-Item -Force $source $backup
    }
  }

  try {
    New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "src/lib") | Out-Null
    Copy-Item -Force (Join-Path $PackageRoot "src/lib/trackerLifecycle.js") (Join-Path $RepoPath "src/lib/trackerLifecycle.js")
    New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "tests") | Out-Null
    Copy-Item -Force (Join-Path $PackageRoot "tests/lifecycle-reset-wallet-search.test.cjs") (Join-Path $RepoPath "tests/lifecycle-reset-wallet-search.test.cjs")

    node (Join-Path $PackageRoot "tools/apply-lifecycle-wallet-search-reset.cjs") $RepoPath
    if ($LASTEXITCODE -ne 0) { throw "Source transformation failed." }
  }
  catch {
    Write-Warning "Transformation failed; restoring the files to their pre-fix state."
    foreach ($relative in $fixFiles) {
      $target = Join-Path $RepoPath $relative
      if ($existed[$relative]) {
        $backup = Join-Path $backupRoot $relative
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        Copy-Item -Force $backup $target
      }
      elseif (Test-Path $target) {
        Remove-Item -Force $target
      }
    }
    throw
  }

  node --check "src/lib/trackerLifecycle.js"
  node --check "src/store/slices/dataSlice.js"
  node --check "src/store/slices/useSyncSlice.js"
  node --check "src/store/slices/transactionsSlice.js"
  node --check "src/store/slices/managementSlice.js"
  node --check "src/store/slices/trackersSlice.js"
  node --check "src/lib/secureVault.js"
  node --check "src/lib/wallets.js"
  node --check "src/lib/modules.js"
  node --check "src/utils/calc.js"
  node "tests/lifecycle-reset-wallet-search.test.cjs" $RepoPath

  if (!$SkipProjectTests) {
    npm run test:logic
    if ($LASTEXITCODE -ne 0) { throw "npm run test:logic failed." }
    npm run test:ui
    if ($LASTEXITCODE -ne 0) { throw "npm run test:ui failed." }
  }

  if (!$SkipAndroidVerify) {
    npm run verify:android
    if ($LASTEXITCODE -ne 0) { throw "npm run verify:android failed." }
  }

  Write-Host ""
  Write-Host "All requested fixes were applied and verification commands passed."
  Write-Host "Temporary pre-fix backup: $backupRoot"
  Write-Host "Restart Expo with: npx expo start -c"
}
finally {
  Pop-Location
}
