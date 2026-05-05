# DEPLOY.md

Fork → update with your own keys → deploy to Fly.io. ~30 minutes end-to-end.

The architecture diagram and Twin role are documented in [ARCHITECTURE.md](./ARCHITECTURE.md). This guide covers only the deployment steps.

---

## Prerequisites

| Tool / account | Where to get it |
|---|---|
| `flyctl` | macOS / Linux: `brew install flyctl`  ·  Windows: `iwr https://fly.io/install.ps1 -useb \| iex` |
| Fly.io account | https://fly.io/app/sign-up (free tier; card required to provision apps) |
| `git`, `curl`, `openssl` | Pre-installed on macOS / Linux / Git Bash |
| Python 3.10+ | Used by `scripts/apply-twin.py` (stdlib only, no pip install) |
| HappyRobot account | https://platform.happyrobot.ai (Twin is included) |
| HappyRobot API key | HR Profile → Developer Settings → API Key (`sk_live_...`) |
| FMCSA QCMobile WebKey | https://mobile.fmcsa.dot.gov → "Request Web Key" (40-char hex, free; consumed by HR workflow only, not the API) |

---

## Step 1 — Fork and clone

Fork https://github.com/AndresMorones/AcmeLogistics on GitHub, then:

```bash
git clone https://github.com/<your-handle>/AcmeLogistics.git
cd AcmeLogistics
```

Generate two random secrets — keep them somewhere safe, you'll paste them into Fly + HR in later steps:

```bash
openssl rand -hex 32   # → API_BEARER_TOKEN (shared between API, dashboard, and HR)
openssl rand -hex 32   # → LINK_SIGNING_SECRET (dashboard middleware only)
```

---

## Step 2 — Fork the HappyRobot workflow

Open the canonical workflow and click **Fork** into your org:

```
https://platform.happyrobot.ai/fdeandresnavarro/workflows/xsfvbpjpsoy4/editor/c8yjoguc8i4t
```

> The workflow lives under the `fdeandresnavarro` org. If the **Fork** button is greyed out, ask the maintainer for an invite to the org or for a workflow-export JSON to import into your own org.

All nodes, prompts, tools, and chip filters come pre-wired. After forking, in your fork:

1. **Workflow Settings → Variables** — set `agent_name`, `company_name`, `negotiation_ceiling_multiplier` (1.10 default), `max_negotiation_rounds` (3 default).
2. **Workflow Settings → Secrets** — add `API_BEARER_TOKEN` (paste the first `openssl` output from Step 1) and `FMCSA_WEB_KEY` (paste your FMCSA WebKey — used by the `verify_carrier` HR webhook node, not the FastAPI).
3. **Web-Call trigger node** — copy the deployment URL (`https://platform.happyrobot.ai/deployments/<id>/<id>`). This is what testers open in a browser to start a call.
4. **Workflow ID** — note the workflow ID from the editor URL (the segment before `/editor/`); you'll paste it into Fly secrets in Step 4.

---

## Step 3 — Create Fly apps and edit fly.toml

Authenticate once:

```bash
flyctl auth login
```

Create two apps (names must be globally unique on Fly):

```bash
flyctl apps create <your-api-name>          # e.g. inbound-carrier-api-jdoe
flyctl apps create <your-dashboard-name>    # e.g. inbound-carrier-dash-jdoe
```

Update the `app = ` line in **two** `fly.toml` files to match the names you just created:

| File | Line to edit |
|---|---|
| `fly.toml` (repo root, API config) | `app = "<your-api-name>"` |
| `dashboard/fly.toml` (dashboard config) | `app = "<your-dashboard-name>"` |

The deploy scripts read these `app =` lines automatically — no other edits needed.

---

## Step 4 — Set Fly secrets

API:

```bash
flyctl secrets set \
  API_BEARER_TOKEN=<token-from-step-1> \
  HAPPYROBOT_API_KEY=<your-sk_live_...> \
  HR_WORKFLOW_ID=<workflow-id-from-step-2> \
  -a <your-api-name>
```

> `HR_WORKFLOW_ID` powers the dashboard's live-call indicator. Without it the indicator shows "Live status off" — everything else still works.

Dashboard:

```bash
flyctl secrets set \
  API_BEARER_TOKEN=<same-token-as-API> \
  API_BASE_URL=https://<your-api-name>.fly.dev \
  LINK_SIGNING_SECRET=<second-openssl-output-from-step-1> \
  -a <your-dashboard-name>
```

> The `API_BEARER_TOKEN` value must be **byte-identical** in three places: API Fly secret, dashboard Fly secret, and HR Workflow Secret (Step 2). It's the only thing authenticating HR's tool calls into your API.

---

## Step 5 — Deploy

```bash
# macOS / Linux
bash scripts/deploy-api.sh
bash scripts/deploy-dashboard.sh
```

```powershell
# Windows
pwsh scripts/deploy-api.ps1
pwsh scripts/deploy-dashboard.ps1
```

Each script `cd`s into the right directory, runs `flyctl deploy --remote-only`, then verifies the deployed image responds with the expected health fingerprint. A wrong image landing on the wrong app exits non-zero.

Verify by hand:

```bash
curl https://<your-api-name>.fly.dev/healthz
# Expected: {"status":"ok","service":"robot-api", ...}

curl https://<your-dashboard-name>.fly.dev/api/health
# Expected: {"status":"ok","service":"acme-dashboard"}
```

---

## Step 6 — Seed the HappyRobot Twin

The Twin is HR's managed Postgres. It's provisioned automatically when your workflow exists — you only need to apply the schema and seed.

The bundled `scripts/apply-twin.py` splits each SQL file into individual statements and POSTs them one at a time (HR's Cloudflare WAF rejects multi-statement bodies). Python 3.10+ stdlib only, no pip install needed.

```bash
export HR_KEY="<your-sk_live_...>"
export HR_BASE="https://platform.happyrobot.ai/api/v2"
# EU orgs: HR_BASE="https://platform.eu.happyrobot.ai/api/v2"

for f in data/twin_schema_loads.sql data/twin_schema_calls_log.sql data/twin_schema_bookings.sql data/twin_seed_loads_v2.sql; do
  python3 scripts/apply-twin.py "$f"
done
```

PowerShell:

```powershell
$env:HR_KEY  = "<your-sk_live_...>"
$env:HR_BASE = "https://platform.happyrobot.ai/api/v2"
foreach ($f in @(
  "data/twin_schema_loads.sql",
  "data/twin_schema_calls_log.sql",
  "data/twin_schema_bookings.sql",
  "data/twin_seed_loads_v2.sql"
)) {
  python scripts/apply-twin.py $f
}
```

Sanity check (one-statement query, fine to send raw):

```bash
curl -sS -X POST "$HR_BASE/twin/sql" \
  -H "Authorization: Bearer $HR_KEY" -H "Content-Type: application/json" \
  -d '{"query":"SELECT COUNT(*) FROM loads"}'
# Expected: rows: [{"count":"150"}]
```

---

## Step 7 — Smoke test

Open the **Web-Call URL** you copied in Step 2. Place a single call:

> *"Hi, MC 1234567, looking for a load."*

Within ~60 seconds of the call ending, the row should appear on the **Calls** tab of your dashboard, and the booking (if one happened) should land on the **Sales Pipeline** board.

---

## Troubleshooting

**Wrong image deployed to wrong app.** Always use `scripts/deploy-{api,dashboard}.{sh,ps1}` — they self-`cd` to the right directory, parse the `app =` line from the right `fly.toml`, and verify the deployed image fingerprint after deploy. A bare `flyctl deploy` from the repo root walks up looking for any `fly.toml`, finds the API one, and ships the API image to whatever `--app` you passed.

**Dashboard returns 401 on every API request.** `API_BEARER_TOKEN` differs between the two Fly apps. Run `flyctl secrets list -a <app>` on each side, regenerate, and `flyctl secrets set` it on both apps and in HR Workflow → Secrets. Both apps redeploy automatically after a secret change.

**Twin SQL returns Cloudflare 403.** WAF rejects multi-statement SQL, large `IN (...)` lists, `ORDER BY ... LIMIT` pairs, and `UNION`. Keep each statement small and atomic. The dashboard read path works around this by pulling raw rows and aggregating Python-side.

**Healthcheck fails right after deploy.** API needs ~10s to warm up; dashboard ~5s. The `grace_period` in each `fly.toml` covers this. If checks still fail, run `flyctl logs -a <app>` — the most common cause is a missing secret.

---

## Cost

Two `shared-cpu-1x / 512MB` machines (one per app) sit in Fly's free allowance. For demo traffic (< 100 calls/day) total cost is effectively $0/month. The Twin is included in HR's free tier; the FMCSA WebKey is free.

---

## Tear down

```bash
flyctl apps destroy <your-api-name>
flyctl apps destroy <your-dashboard-name>
```

Drop Twin tables from the HR UI (Workflows → Twin → right-click → drop), or via SQL — `DROP TABLE` is single-statement so the raw curl is fine here:

```bash
for t in bookings calls_log loads; do
  curl -sS -X POST "$HR_BASE/twin/sql" \
    -H "Authorization: Bearer $HR_KEY" -H "Content-Type: application/json" \
    -d "{\"query\":\"DROP TABLE IF EXISTS $t\"}"
done
```

Delete the workflow itself from the HR UI (Workflows list → trash icon).
