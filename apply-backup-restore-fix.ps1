param(
  [Parameter(Mandatory=$false)]
  [string]$RepoPath = "."
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoPath = (Resolve-Path $RepoPath).Path

Push-Location $RepoPath
try {
  if (!(Test-Path "package.json")) { throw "package.json not found." }

  $files = @(
    "src/lib/backupData.js",
    "src/lib/myfiFiles.js",
    "src/lib/secureVault.js",
    "src/store/slices/dataSlice.js",
    "src/screens/SettingsScreen.js",
    "tests/backup-restore-hardening.test.cjs"
  )

  $backupRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("MYFI1-backup-fix-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
  $existed = @{}

  foreach ($relative in $files) {
    $source = Join-Path $RepoPath $relative
    $existed[$relative] = Test-Path $source
    if ($existed[$relative]) {
      $dest = Join-Path $backupRoot $relative
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
      Copy-Item -Force $source $dest
    }
  }

  try {
    New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "src/lib") | Out-Null
    Copy-Item -Force (Join-Path $PackageRoot "src/lib/backupData.js") (Join-Path $RepoPath "src/lib/backupData.js")
    New-Item -ItemType Directory -Force -Path (Join-Path $RepoPath "tests") | Out-Null
    Copy-Item -Force (Join-Path $PackageRoot "tests/backup-restore-hardening.test.cjs") (Join-Path $RepoPath "tests/backup-restore-hardening.test.cjs")

    node (Join-Path $PackageRoot "tools/apply-backup-restore-fix.cjs") $RepoPath
    if ($LASTEXITCODE -ne 0) { throw "Backup/restore transformation failed." }

    node --check "src/lib/backupData.js"
    node --check "src/lib/myfiFiles.js"
    node --check "src/lib/secureVault.js"
    node --check "src/store/slices/dataSlice.js"
    node "tests/backup-restore-hardening.test.cjs" $RepoPath

    npm run test:logic
    if ($LASTEXITCODE -ne 0) { throw "test:logic failed." }
    npm run test:ui
    if ($LASTEXITCODE -ne 0) { throw "test:ui failed." }
    npm run verify:android
    if ($LASTEXITCODE -ne 0) { throw "verify:android failed." }
  }
  catch {
    Write-Warning "Fix failed; restoring previous files."
    foreach ($relative in $files) {
      $target = Join-Path $RepoPath $relative
      if ($existed[$relative]) {
        $source = Join-Path $backupRoot $relative
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        Copy-Item -Force $source $target
      }
      elseif (Test-Path $target) {
        Remove-Item -Force $target
      }
    }
    throw
  }

  Write-Host ""
  Write-Host "Backup/restore hardening applied and verification passed."
  Write-Host "Pre-fix backup: $backupRoot"
}
finally {
  Pop-Location
}
