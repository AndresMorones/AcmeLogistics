#!/usr/bin/env bash
# WHY: running `flyctl deploy` from the repo root applies the API fly.toml and
# silently ships the API image to the dashboard app. See docs/activity-log.md.
set -euo pipefail

APP="acme-dashboard-andres-morones"
URL="https://${APP}.fly.dev"
HEALTH_FINGERPRINT='"service":"robot-dashboard"'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$(cd "${SCRIPT_DIR}/../dashboard" && pwd)"

[[ -f "${DASHBOARD_DIR}/fly.toml" ]] || { echo "ERR: ${DASHBOARD_DIR}/fly.toml missing"; exit 1; }
grep -q "app = \"${APP}\"" "${DASHBOARD_DIR}/fly.toml" || { echo "ERR: ${DASHBOARD_DIR}/fly.toml is not the dashboard config"; exit 1; }

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
