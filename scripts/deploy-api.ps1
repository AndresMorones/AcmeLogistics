$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$FlyToml = Join-Path $RepoRoot "fly.toml"

if (-not (Test-Path $FlyToml)) { Write-Error "ERR: $FlyToml missing"; exit 1 }
$AppMatch = Select-String -Path $FlyToml -Pattern '^app = "([^"]+)"' | Select-Object -First 1
if (-not $AppMatch) { Write-Error "ERR: could not parse 'app =' from $FlyToml"; exit 1 }
$App = $AppMatch.Matches[0].Groups[1].Value
$Url = "https://$App.fly.dev"
$HealthFingerprint = '"service":"robot-api"'

Write-Output ">> Deploying $App from $RepoRoot"
Push-Location $RepoRoot
try {
  flyctl deploy --remote-only --app $App
  if ($LASTEXITCODE -ne 0) { Write-Error "flyctl deploy failed"; exit $LASTEXITCODE }
} finally { Pop-Location }

# Fingerprint guards against the dashboard image landing on this app.
Write-Output ">> Verifying $Url/healthz serves the API image"
$body = (Invoke-WebRequest -Uri "$Url/healthz" -UseBasicParsing -TimeoutSec 15).Content
if ($body -like "*$HealthFingerprint*") {
  Write-Output "OK: API image confirmed ($body)"
} else {
  Write-Error "ERR: wrong image deployed to ${App}! expected '$HealthFingerprint', got: $body"
  exit 2
}
