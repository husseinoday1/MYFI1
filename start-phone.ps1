$ErrorActionPreference = 'Stop'

$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$systemNode = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($systemNode) { $systemNode.Source } else { $bundledNode }
$expoCli = Join-Path $PSScriptRoot 'node_modules\expo\bin\cli'

if (-not (Test-Path -LiteralPath $nodePath)) {
  Write-Error 'Node.js was not found. Install Node.js LTS, then run this file again.'
}

if (-not (Test-Path -LiteralPath $expoCli)) {
  Write-Error 'Expo dependencies were not found in this MYFI folder.'
}

# Fresh-new-user development mode.
# Financial data created in this mode uses an isolated test vault.
# The test vault is cleared on each new start-phone.ps1 launch.
# Real guest/account vaults are not cleared or synchronized by this mode.
$env:EXPO_PUBLIC_FORCE_ONBOARDING = '1'
$env:EXPO_PUBLIC_FRESH_TEST = '1'

Write-Host 'Starting MYFI in FRESH NEW-USER TEST MODE...' -ForegroundColor Magenta
Write-Host 'Each launch starts with an empty isolated test workspace.' -ForegroundColor Yellow
Write-Host 'Real local/cloud financial data is not loaded into this test workspace.' -ForegroundColor Green
Write-Host 'Test financial changes are not synchronized to the cloud.' -ForegroundColor Green
Write-Host 'Keep this terminal open and scan the QR code from your phone.' -ForegroundColor Cyan

try {
  & $nodePath $expoCli start --host lan --clear
}
finally {
  Remove-Item Env:EXPO_PUBLIC_FORCE_ONBOARDING -ErrorAction SilentlyContinue
  Remove-Item Env:EXPO_PUBLIC_FRESH_TEST -ErrorAction SilentlyContinue
}
