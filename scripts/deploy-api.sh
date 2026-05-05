#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FLY_TOML="${REPO_ROOT}/fly.toml"

[[ -f "${FLY_TOML}" ]] || { echo "ERR: ${FLY_TOML} missing"; exit 1; }
APP="$(grep -E '^app = ' "${FLY_TOML}" | head -1 | sed -E 's/^app = "([^"]+)".*$/\1/')"
[[ -n "${APP}" ]] || { echo "ERR: could not parse 'app =' from ${FLY_TOML}"; exit 1; }
URL="https://${APP}.fly.dev"
HEALTH_FINGERPRINT='"service":"robot-api"'

echo ">> Deploying ${APP} from ${REPO_ROOT}"
cd "${REPO_ROOT}"
flyctl deploy --remote-only --app "${APP}"

# Fingerprint guards against the dashboard image landing on this app — wrong
# image returns the dashboard payload here, exiting non-zero.
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
