param(
  [string]$ProjectRef = "qihahfufuupgivnjzmfe",
  [string]$VisionModel = "gpt-4.1-mini",
  [string]$TranscribeModel = "gpt-4o-mini-transcribe"
)

$ErrorActionPreference = "Stop"

if (Get-Command supabase -ErrorAction SilentlyContinue) {
  $SupabaseCommand = "supabase"
} else {
  $SupabaseCommand = "cmd /c npx --yes supabase"
  Write-Host "Supabase CLI was not found globally. Falling back to npx." -ForegroundColor Yellow
}

if (-not $env:OPENAI_API_KEY) {
  Write-Host "OPENAI_API_KEY is not set in this shell." -ForegroundColor Yellow
  Write-Host "Example:" -ForegroundColor Yellow
  Write-Host '$env:OPENAI_API_KEY="sk-..."' -ForegroundColor Cyan
  exit 1
}

Write-Host "Linking project $ProjectRef..." -ForegroundColor Cyan
Invoke-Expression "$SupabaseCommand link --project-ref $ProjectRef"

Write-Host "Setting function secrets..." -ForegroundColor Cyan
Invoke-Expression "$SupabaseCommand secrets set OPENAI_API_KEY=$env:OPENAI_API_KEY OPENAI_VISION_MODEL=$VisionModel OPENAI_TRANSCRIBE_MODEL=$TranscribeModel"

Write-Host "Deploying smart-ocr..." -ForegroundColor Cyan
Invoke-Expression "$SupabaseCommand functions deploy smart-ocr"

Write-Host "Deploying smart-transcribe..." -ForegroundColor Cyan
Invoke-Expression "$SupabaseCommand functions deploy smart-transcribe"

Write-Host "Smart capture functions deployed." -ForegroundColor Green
