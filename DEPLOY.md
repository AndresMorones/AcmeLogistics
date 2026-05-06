# DEPLOY.md

Fork → set keys → deploy to Fly.io. ~30 minutes end-to-end. Architecture context lives in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Prerequisites

| Tool / account | Where to get it |
|---|---|
| `flyctl` | macOS / Linux: `brew install flyctl`  ·  Windows: `iwr https://fly.io/install.ps1 -useb \| iex` |
| Fly.io account | https://fly.io/app/sign-up |
| `git`, `curl`, `openssl`, Python 3.10+ | Standard developer tooling |
| HappyRobot account + API key | https://platform.happyrobot.ai → Profile → Developer Settings |
| FMCSA QCMobile WebKey | https://mobile.fmcsa.dot.gov → "Request Web Key" |

## Step 1 — Fork and clone

```bash
git clone https://github.com/<your-handle>/AcmeLogistics.git
cd AcmeLogistics
openssl rand -hex 32   # → API_BEARER_TOKEN (save it)
openssl rand -hex 32   # → LINK_SIGNING_SECRET (save it)
```

## Step 2 — Fork the HappyRobot workflow

Open `https://platform.happyrobot.ai/fdeandresnavarro/workflows/xsfvbpjpsoy4/editor/c8yjoguc8i4t` and click **Fork**. In your fork:

1. **Workflow Settings → Variables** — set `agent_name`, `company_name`, `negotiation_ceiling_multiplier`, `max_negotiation_rounds`.
2. **Workflow Settings → Secrets** — add `API_BEARER_TOKEN_` (token from Step 1) and `FMCSA_WEB_KEY`. The HR variable name has a **trailing underscore**; the FastAPI env var does not. Values must match byte-for-byte.
3. **Web-Call trigger node** — copy the deployment URL (testers open this to start a call).
4. Note the workflow ID from the editor URL.

## Step 3 — Create Fly apps

```bash
flyctl auth login
flyctl apps create <your-api-name>
flyctl apps create <your-dashboard-name>
```

Update the `app = ` line in both `fly.toml` files (`./fly.toml` and `dashboard/fly.toml`) to match.

## Step 4 — Set Fly secrets

```bash
flyctl secrets set \
  API_BEARER_TOKEN=<token-from-step-1> \
  HAPPYROBOT_API_KEY=<your-sk_live_...> \
  HR_WORKFLOW_ID=<workflow-id-from-step-2> \
  -a <your-api-name>

flyctl secrets set \
  API_BEARER_TOKEN=<same-token-as-API> \
  API_BASE_URL=https://<your-api-name>.fly.dev \
  LINK_SIGNING_SECRET=<second-openssl-output-from-step-1> \
  -a <your-dashboard-name>
```

## Step 5 — Deploy

```bash
# macOS / Linux
bash scripts/deploy-api.sh
bash scripts/deploy-dashboard.sh

# Windows
pwsh scripts/deploy-api.ps1
pwsh scripts/deploy-dashboard.ps1
```

## Step 6 — Seed the Twin

```bash
export HR_KEY="<your-sk_live_...>"
export HR_BASE="https://platform.happyrobot.ai/api/v2"   # EU orgs: platform.eu.happyrobot.ai

for f in data/twin_schema_loads.sql data/twin_schema_calls_log.sql data/twin_schema_bookings.sql data/twin_seed_loads_v2.sql; do
  python3 scripts/apply-twin.py "$f"
done
```

## Step 7 — Apply the load-lifecycle migration

```bash
python scripts/apply-twin.py data/twin_schema_loads_status.sql
```

## Step 8 — Smoke test

```bash
curl https://<your-api-name>.fly.dev/healthz
curl https://<your-dashboard-name>.fly.dev/api/health
```

Open the Web-Call URL from Step 2 and place a call: *"Hi, MC 1234567, looking for a load."* Within ~60 seconds the row appears on the **Calls** tab and any booking lands on the **Sales Pipeline** board.

## Tear down

```bash
flyctl apps destroy <your-api-name>
flyctl apps destroy <your-dashboard-name>
```

Drop Twin tables from the HR UI (Workflows → Twin → drop), then delete the workflow from the HR UI.
