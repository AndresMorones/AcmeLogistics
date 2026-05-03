$ErrorActionPreference = "Stop"

$App = "robot-api-andres-morones"
$Url = "https://$App.fly.dev"
$HealthFingerprint = '"service":"robot-api"'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$FlyToml = Join-Path $RepoRoot "fly.toml"

if (-not (Test-Path $FlyToml)) { Write-Error "ERR: $FlyToml missing"; exit 1 }
if (-not (Select-String -Path $FlyToml -Pattern "app = `"$App`"" -Quiet)) {
  Write-Error "ERR: $FlyToml is not the API config"; exit 1
}

Write-Output ">> Deploying $App from $RepoRoot"
Push-Location $RepoRoot
try {
  flyctl deploy --remote-only --app $App
  if ($LASTEXITCODE -ne 0) { Write-Error "flyctl deploy failed"; exit $LASTEXITCODE }
} finally { Pop-Location }

# Fingerprint check catches the inverse of the dashboard footgun: if a wrong image
# lands on this app, /healthz returns the dashboard payload and we exit non-zero.
Write-Output ">> Verifying $Url/healthz serves the API image"
$body = (Invoke-WebRequest -Uri "$Url/healthz" -UseBasicParsing -TimeoutSec 15).Content
if ($body -like "*$HealthFingerprint*") {
  Write-Output "OK: API image confirmed ($body)"
} else {
  Write-Error "ERR: wrong image deployed to ${App}! expected '$HealthFingerprint', got: $body"
  exit 2
}
