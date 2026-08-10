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

Write-Host 'Starting MYFI for Expo Go with a clean Metro cache...' -ForegroundColor Cyan
Write-Host 'Keep this terminal open and scan the QR code from your phone.' -ForegroundColor Yellow
& $nodePath $expoCli start --host lan --clear
