param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"

function Stop-WithMessage {
  param([string]$Text)
  Write-Host ""
  Write-Host $Text -ForegroundColor Red
  Write-Host ""
  Read-Host "اضغط Enter للخروج"
  exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

Write-Host "MYFI GitHub Upload" -ForegroundColor Green
Write-Host "Repository: $repoRoot"
Write-Host ""

git rev-parse --is-inside-work-tree | Out-Null

$remote = git remote get-url origin 2>$null
if (-not $remote) {
  Stop-WithMessage "لا يوجد remote باسم origin. اربط المشروع بـ GitHub أولاً."
}

$branch = git branch --show-current
if (-not $branch) {
  Stop-WithMessage "لا يوجد branch حالي واضح."
}

Write-Host "Remote: $remote"
Write-Host "Branch: $branch"
Write-Host ""

$ignoredSensitive = git status --ignored --short .env node_modules tmp .expo .myfi-backups 2>$null
if ($ignoredSensitive) {
  Write-Host "ملفات محلية مستثناة ولن ترفع:" -ForegroundColor Yellow
  $ignoredSensitive | ForEach-Object { Write-Host "  $_" }
  Write-Host ""
}

$status = git status --short
if (-not $status) {
  Write-Host "لا توجد تغييرات جديدة للرفع." -ForegroundColor Green
  Read-Host "اضغط Enter للخروج"
  exit 0
}

Write-Host "التغييرات التي سترفع:" -ForegroundColor Cyan
$status | ForEach-Object { Write-Host "  $_" }
Write-Host ""

if (-not $Message.Trim()) {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
  $Message = "Update MYFI project $stamp"
}

$answer = Read-Host "اكتب YES للمتابعة بالـ commit والرفع إلى GitHub"
if ($answer -ne "YES") {
  Write-Host "تم الإلغاء. لم يتم رفع أي شيء." -ForegroundColor Yellow
  Read-Host "اضغط Enter للخروج"
  exit 0
}

git add -A

$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Host "لا توجد ملفات staged بعد git add." -ForegroundColor Yellow
  Read-Host "اضغط Enter للخروج"
  exit 0
}

git commit -m $Message
git push -u origin $branch

Write-Host ""
Write-Host "تم رفع MYFI إلى GitHub بنجاح." -ForegroundColor Green
Write-Host "Branch: $branch"
Write-Host "Message: $Message"
Write-Host ""
Read-Host "اضغط Enter للخروج"
