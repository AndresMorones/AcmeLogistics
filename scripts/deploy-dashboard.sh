#!/usr/bin/env bash
# Running `flyctl deploy` from the repo root applies the API fly.toml and ships
# the API image to the dashboard app. This script forces the dashboard cwd.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$(cd "${SCRIPT_DIR}/../dashboard" && pwd)"
FLY_TOML="${DASHBOARD_DIR}/fly.toml"

[[ -f "${FLY_TOML}" ]] || { echo "ERR: ${FLY_TOML} missing"; exit 1; }
APP="$(grep -E '^app = ' "${FLY_TOML}" | head -1 | sed -E 's/^app = "([^"]+)".*$/\1/')"
[[ -n "${APP}" ]] || { echo "ERR: could not parse 'app =' from ${FLY_TOML}"; exit 1; }
URL="https://${APP}.fly.dev"
HEALTH_FINGERPRINT='"service":"acme-dashboard"'

echo ">> Deploying ${APP} from ${DASHBOARD_DIR}"
cd "${DASHBOARD_DIR}"
flyctl deploy --remote-only --app "${APP}"

echo ">> Verifying ${URL}/api/health serves the dashboard image"
HEALTH_BODY="$(curl -s --max-time 15 "${URL}/api/health" || true)"
if [[ "${HEALTH_BODY}" == *"${HEALTH_FINGERPRINT}"* ]]; then
  echo "OK: dashboard image confirmed (${HEALTH_BODY})"
else
  echo "ERR: wrong image deployed to ${APP}!"
  echo "     expected fingerprint: ${HEALTH_FINGERPRINT}"
  echo "     got: ${HEALTH_BODY}"
  exit 2
fi
