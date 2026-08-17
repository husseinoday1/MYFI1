param(
  [string]$ProjectPath = "C:\Users\husse\OneDrive\Документы\MYFI"
)

$ErrorActionPreference = "Stop"
function Fail([string]$Message) {
  Write-Host "[FAIL] $Message" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $ProjectPath)) { Fail "Project path not found: $ProjectPath" }
Set-Location $ProjectPath

$Head = (git rev-parse HEAD).Trim()
$Branch = (git branch --show-current).Trim()
if (@(git status --porcelain -uall).Count -ne 0) {
  Fail "Working tree must be clean before local APK build"
}

$Eas = Get-Content (Join-Path $ProjectPath "eas.json") -Raw | ConvertFrom-Json
$PreviewEnv = $Eas.build.preview.env
if (-not $PreviewEnv.EXPO_PUBLIC_SUPABASE_URL -or -not $PreviewEnv.EXPO_PUBLIC_SUPABASE_KEY) {
  Fail "Preview Supabase environment is missing from eas.json"
}

$env:EXPO_PUBLIC_SUPABASE_URL = [string]$PreviewEnv.EXPO_PUBLIC_SUPABASE_URL
$env:EXPO_PUBLIC_SUPABASE_KEY = [string]$PreviewEnv.EXPO_PUBLIC_SUPABASE_KEY
$env:NODE_ENV = "production"

$Gradle = Join-Path $ProjectPath "android\gradlew.bat"
if (-not (Test-Path $Gradle)) { Fail "android\gradlew.bat is missing" }

Write-Host "[LOCAL-APK] Branch=$Branch"
Write-Host "[LOCAL-APK] HEAD=$Head"
Write-Host "[LOCAL-APK] EAS cloud build quota is NOT used."
Write-Host "[LOCAL-APK] Build type=release / current native internal-test signing configuration"

Push-Location (Join-Path $ProjectPath "android")
try {
  & .\gradlew.bat :app:assembleRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { Fail "Gradle assembleRelease exit $LASTEXITCODE" }
} finally {
  Pop-Location
}

$SourceApk = Join-Path $ProjectPath "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $SourceApk)) { Fail "Release APK not found: $SourceApk" }

$OutputDir = Join-Path $ProjectPath "dist-local"
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
$OutputApk = Join-Path $OutputDir "MYFI-P19-013-internal.apk"
Copy-Item $SourceApk $OutputApk -Force
$Hash = (Get-FileHash $OutputApk -Algorithm SHA256).Hash.ToLowerInvariant()

Write-Host ""
Write-Host "[PASS] LOCAL INTERNAL APK BUILD COMPLETE" -ForegroundColor Green
Write-Host "[RESULT] APK=$OutputApk"
Write-Host "[RESULT] SHA256=$Hash"
Write-Host "[RESULT] EASBuildQuotaUsed=NO"
Write-Host "[RESULT] ProductionSigningCertified=NO"
