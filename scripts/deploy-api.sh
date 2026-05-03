#!/usr/bin/env bash
set -euo pipefail

APP="robot-api-andres-morones"
URL="https://${APP}.fly.dev"
HEALTH_FINGERPRINT='"service":"robot-api"'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

[[ -f "${REPO_ROOT}/fly.toml" ]] || { echo "ERR: ${REPO_ROOT}/fly.toml missing"; exit 1; }
grep -q "app = \"${APP}\"" "${REPO_ROOT}/fly.toml" || { echo "ERR: ${REPO_ROOT}/fly.toml is not the API config"; exit 1; }

echo ">> Deploying ${APP} from ${REPO_ROOT}"
cd "${REPO_ROOT}"
flyctl deploy --remote-only --app "${APP}"

# Fingerprint check catches the inverse of the dashboard footgun: if a wrong image
# lands on this app, /healthz returns the dashboard payload and we exit non-zero.
echo ">> Verifying ${URL}/healthz serves the API image"
HEALTH_BODY="$(curl -s --max-time 15 "${URL}/healthz" || true)"
if [[ "${HEALTH_BODY}" == *"${HEALTH_FINGERPRINT}"* ]]; then
  echo "OK: API image confirmed (${HEALTH_BODY})"
else
  echo "ERR: wrong image deployed to ${APP}!"
  echo "     expected fingerprint: ${HEALTH_FINGERPRINT}"
  echo "     got: ${HEALTH_BODY}"
  exit 2
fi
