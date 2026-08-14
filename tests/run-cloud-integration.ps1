param(
  [string]$ProjectRef = 'qihahfufuupgivnjzmfe',
  [string]$NodePath = 'node',
  [string]$SupabasePath = ''
)

$ErrorActionPreference = 'Stop'
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$imagePath = Join-Path $workspace '.tmp-myfi-cloud-receipt.png'
$audioPath = Join-Path $workspace '.tmp-myfi-cloud-voice.wav'
$cliPath = Join-Path $workspace 'tools\supabase-cli\supabase.exe'
$cliCommand = $null
$baseUrl = "https://$ProjectRef.supabase.co"
$userId = $null
$serviceKey = $null
$testExitCode = 1

try {
  if ($SupabasePath) {
    if (-not (Test-Path -LiteralPath $SupabasePath)) { throw "Supabase CLI was not found at $SupabasePath." }
    $cliCommand = (Resolve-Path -LiteralPath $SupabasePath).Path
  } elseif (Test-Path -LiteralPath $cliPath) {
    $cliCommand = $cliPath
  } else {
    $pathCommand = Get-Command supabase -ErrorAction SilentlyContinue
    if ($pathCommand) { $cliCommand = $pathCommand.Source }
  }
  if (-not $cliCommand) {
    throw 'Supabase CLI was not found. Install it with `npm install --save-dev supabase`, `scoop install supabase`, or pass -SupabasePath.'
  }

  Add-Type -AssemblyName System.Drawing
  $image = New-Object System.Drawing.Bitmap 900,420
  $graphics = [System.Drawing.Graphics]::FromImage($image)
  $graphics.Clear([System.Drawing.Color]::White)
  $titleFont = New-Object System.Drawing.Font('Arial',42,[System.Drawing.FontStyle]::Bold)
  $bodyFont = New-Object System.Drawing.Font('Arial',34)
  $brush = [System.Drawing.Brushes]::Black
  $graphics.DrawString('MYFI TEST RECEIPT',$titleFont,$brush,55,50)
  $graphics.DrawString('COFFEE SHOP',$bodyFont,$brush,55,145)
  $graphics.DrawString('TOTAL 12500 IQD',$titleFont,$brush,55,245)
  $image.Save($imagePath,[System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $titleFont.Dispose()
  $bodyFont.Dispose()
  $image.Dispose()

  Add-Type -AssemblyName System.Speech
  $speech = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $speech.SetOutputToWaveFile($audioPath)
  $speech.Speak('Paid coffee twelve thousand five hundred Iraqi dinars')
  $speech.Dispose()

  $rawKeys = & $cliCommand projects api-keys --project-ref $ProjectRef -o json
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not read Supabase project API keys. Run `supabase login`, set SUPABASE_ACCESS_TOKEN, or pass existing test credentials to tests/run-cloud-integration.cjs.'
  }
  $keys = $rawKeys | ConvertFrom-Json
  $serviceKey = ($keys | Where-Object { $_.name -eq 'service_role' }).api_key
  if (-not $serviceKey) { throw 'Supabase service role key was unavailable.' }

  $email = 'myfi-cloud-e2e-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + '@example.com'
  $password = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
  $adminHeaders = @{ apikey = $serviceKey; Authorization = 'Bearer ' + $serviceKey }
  $createBody = @{ email = $email; password = $password; email_confirm = $true } | ConvertTo-Json
  $created = Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/v1/admin/users" -Headers $adminHeaders -ContentType 'application/json' -Body $createBody
  $userId = $created.id
  if (-not $userId) { throw 'Temporary user creation failed.' }
  Write-Output 'temporary-user: created'

  $env:MYFI_TEST_EMAIL = $email
  $env:MYFI_TEST_PASSWORD = $password
  $env:MYFI_TEST_IMAGE_FILE = $imagePath
  $env:MYFI_TEST_AUDIO_FILE = $audioPath
  & $NodePath (Join-Path $PSScriptRoot 'run-cloud-integration.cjs')
  $snapshotExitCode = $LASTEXITCODE
  & $NodePath (Join-Path $PSScriptRoot 'run-financial-mutation-sync-e2e.cjs')
  $mutationExitCode = $LASTEXITCODE
  $testExitCode = if ($snapshotExitCode -eq 0 -and $mutationExitCode -eq 0) { 0 } else { 1 }
}
finally {
  if ($userId -and $serviceKey) {
    $deleteHeaders = @{ apikey = $serviceKey; Authorization = 'Bearer ' + $serviceKey }
    Invoke-RestMethod -Method Delete -Uri "$baseUrl/auth/v1/admin/users/$userId" -Headers $deleteHeaders | Out-Null
    Write-Output 'temporary-user: removed'
  }

  $workspacePrefix = $workspace + [System.IO.Path]::DirectorySeparatorChar
  foreach ($target in @($imagePath,$audioPath)) {
    $resolved = [System.IO.Path]::GetFullPath($target)
    if (-not $resolved.StartsWith($workspacePrefix,[System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe cleanup target.' }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Force }
  }
  Remove-Item Env:MYFI_TEST_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:MYFI_TEST_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:MYFI_TEST_IMAGE_FILE -ErrorAction SilentlyContinue
  Remove-Item Env:MYFI_TEST_AUDIO_FILE -ErrorAction SilentlyContinue
  $serviceKey = $null
  Write-Output 'temporary-files: removed'
}

exit $testExitCode
