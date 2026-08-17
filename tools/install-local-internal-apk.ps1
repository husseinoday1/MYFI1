param(
  [string]$ProjectPath = "C:\Users\husse\OneDrive\Документы\MYFI"
)

$ErrorActionPreference = "Stop"
function Fail([string]$Message) {
  Write-Host "[FAIL] $Message" -ForegroundColor Red
  exit 1
}

$Apk = Join-Path $ProjectPath "dist-local\MYFI-P19-013-internal.apk"
if (-not (Test-Path $Apk)) { Fail "APK not found. Run npm run build:apk:local first." }

$candidates = @(
  (Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"),
  (Join-Path $env:ANDROID_SDK_ROOT "platform-tools\adb.exe"),
  "C:\Android\platform-tools\platform-tools\adb.exe",
  "C:\Android\platform-tools\adb.exe"
) | Where-Object { $_ -and (Test-Path $_) }

$Adb = $candidates | Select-Object -First 1
if (-not $Adb) {
  $cmd = Get-Command adb.exe -ErrorAction SilentlyContinue
  if ($cmd) { $Adb = $cmd.Source }
}
if (-not $Adb) { Fail "adb.exe not found" }

$devices = & $Adb devices
$authorized = @($devices | Select-String "	device$")
if ($authorized.Count -ne 1) {
  Fail "Expected exactly one authorized Android device; found $($authorized.Count)"
}

Write-Host "[INSTALL] Trying non-destructive update install (-r)."
$output = & $Adb install -r $Apk 2>&1
$output | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -eq 0 -and ($output -join "`n") -match "Success") {
  Write-Host "[PASS] LOCAL APK INSTALLED WITHOUT CLEARING APP DATA" -ForegroundColor Green
  exit 0
}

$text = ($output -join "`n")
if ($text -match "INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match|signature") {
  Write-Host "[BLOCKED] SIGNATURE_MISMATCH" -ForegroundColor Yellow
  Write-Host "[BLOCKED] No uninstall or app-data clear was performed."
  Write-Host "[NEXT] Ask for the one-time isolated reinstall command only after cloud recovery evidence is re-verified."
  exit 2
}

Fail "adb install -r failed"
