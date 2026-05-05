# Running `flyctl deploy` from the repo root applies the API fly.toml and ships
# the API image to the dashboard app. This script forces the dashboard cwd.
$ErrorActionPreference = "Stop"

$DashboardDir = (Resolve-Path (Join-Path $PSScriptRoot "..\dashboard")).Path
$FlyToml = Join-Path $DashboardDir "fly.toml"

if (-not (Test-Path $FlyToml)) { Write-Error "ERR: $FlyToml missing"; exit 1 }
$AppMatch = Select-String -Path $FlyToml -Pattern '^app = "([^"]+)"' | Select-Object -First 1
if (-not $AppMatch) { Write-Error "ERR: could not parse 'app =' from $FlyToml"; exit 1 }
$App = $AppMatch.Matches[0].Groups[1].Value
$Url = "https://$App.fly.dev"
$HealthFingerprint = '"service":"acme-dashboard"'

Write-Output ">> Deploying $App from $DashboardDir"
Push-Location $DashboardDir
try {
  flyctl deploy --remote-only --app $App
  if ($LASTEXITCODE -ne 0) { Write-Error "flyctl deploy failed"; exit $LASTEXITCODE }
} finally { Pop-Location }

Write-Output ">> Verifying $Url/api/health serves the dashboard image"
$body = (Invoke-WebRequest -Uri "$Url/api/health" -UseBasicParsing -TimeoutSec 15).Content
if ($body -like "*$HealthFingerprint*") {
  Write-Output "OK: dashboard image confirmed ($body)"
} else {
  Write-Error "ERR: wrong image deployed to ${App}! expected '$HealthFingerprint', got: $body"
  exit 2
}
