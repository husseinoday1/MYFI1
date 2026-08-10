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

# Development-only first-run mode.
# This does NOT delete transactions, wallets, trackers, settings, or account data.
# App.js reads this flag and only forces the onboarding UI to appear.
$env:EXPO_PUBLIC_FORCE_ONBOARDING = '1'

Write-Host 'Starting MYFI in FIRST-RUN TEST MODE...' -ForegroundColor Magenta
Write-Host 'Onboarding will appear as if this is the first app launch.' -ForegroundColor Yellow
Write-Host 'Your saved financial data is NOT deleted.' -ForegroundColor Green
Write-Host 'Keep this terminal open and scan the QR code from your phone.' -ForegroundColor Cyan

try {
  & $nodePath $expoCli start --host lan --clear
}
finally {
  # Do not leave the test flag enabled in this PowerShell session after Expo exits.
  Remove-Item Env:EXPO_PUBLIC_FORCE_ONBOARDING -ErrorAction SilentlyContinue
}