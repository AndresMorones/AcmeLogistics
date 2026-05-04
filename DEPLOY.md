# DEPLOY.md

Deploy this stack to Fly.io from scratch in ~30 minutes.

This guide takes you from a fresh `git clone` to a live, HTTPS-served voice-agent
backend and dashboard. The only artifacts you need are the files in this repo
plus accounts on three free services (Fly.io, HappyRobot, FMCSA).

---

## Architecture at a glance

Two small services, both deployed independently to Fly.io:

| Service       | Path          | Image base               | Port | Public URL                                   |
|---------------|---------------|--------------------------|------|----------------------------------------------|
| API           | `api/`        | `python:3.12-slim`       | 8000 | `https://<your-api-name>.fly.dev`            |
| Dashboard     | `dashboard/`  | `node:20-bookworm-slim`  | 3000 | `https://<your-dashboard-name>.fly.dev`      |

The API reads the loads catalog from a CSV bundled into the image and reads
per-call data from the HappyRobot Twin (managed Postgres) over REST. The
dashboard is a Next.js 15 server-rendered app that calls the API with a shared
Bearer token.

---

## Prerequisites

| Tool / Account            | How to get it                                                                 |
|---------------------------|-------------------------------------------------------------------------------|
| Docker (any recent)       | https://docs.docker.com/get-docker/                                           |
| `flyctl`                  | macOS / Linux: `brew install flyctl`  ·  Windows: `iwr https://fly.io/install.ps1 -useb \| iex` |
| Fly.io account            | https://fly.io/app/sign-up (free tier OK; card required to provision apps)    |
| HappyRobot account        | https://platform.happyrobot.ai (any tier — Twin is included)                  |
| HappyRobot API key        | HR Profile -> Developer Settings -> API Key (`sk_live_...`)                   |
| FMCSA QCMobile WebKey     | https://mobile.fmcsa.dot.gov -> "Request Web Key" (40-char hex, free)         |
| `openssl` (for secrets)   | Pre-installed on macOS / Linux / Git Bash; on Windows use WSL or Git Bash     |

You should also have `git`, `curl`, and either `bash` or `pwsh` available.

---

## Step 1 — Clone and set local secrets

```bash
git clone https://github.com/<your-fork>/AcmeLogistics.git
cd AcmeLogistics
```

Copy the env templates. Two templates exist in this repo (`.env.example` at the
repo root, and `dashboard/.env.example`); the API picks up the same root values
via `docker-compose.yml`.

```bash
# Root: powers `docker compose up`
cp .env.example .env

# Dashboard: powers `npm run dev` if you ever run the dashboard outside Docker
cp dashboard/.env.example dashboard/.env.local
```

Generate two strong random secrets — both must be 32-byte hex:

```bash
openssl rand -hex 32   # use the output for API_BEARER_TOKEN
openssl rand -hex 32   # use the output for LINK_SIGNING_SECRET
```

Fill in the variables as follows. **`API_BEARER_TOKEN` must be byte-identical
in every file** — it is the shared secret between the API, the dashboard, and
the HR workflow.

### Root `.env` (consumed by `docker-compose.yml`)

| Var                  | Value                                                  |
|----------------------|--------------------------------------------------------|
| `API_BEARER_TOKEN`   | First `openssl` output from above                      |
| `HAPPYROBOT_API_KEY` | Your HR `sk_live_...` key                              |
| `FMCSA_WEB_KEY`      | Your 40-char FMCSA WebKey (optional — consumed by HR workflow, not this API) |

### `dashboard/.env.local` (consumed by `npm run dev` only)

| Var                    | Value                                                  |
|------------------------|--------------------------------------------------------|
| `API_BEARER_TOKEN`     | Same value as root `.env`                              |
| `API_BASE_URL`         | `http://localhost:8000`                                |
| `LINK_SIGNING_SECRET`  | Second `openssl` output (or leave blank to disable middleware locally) |

> **Note on `LINK_SIGNING_SECRET`:** this is consumed by the dashboard only — it
> protects the dashboard URL with HMAC-signed query-string tokens (`?t=<exp>.<sig>`).
> The API does not read it. Leave blank for local dev; set it in production
> Fly secrets if you want signed access links.

> **Note on `api/.env`:** the API reads its env via `pydantic-settings` from a
> `.env` file in `api/` when run *outside* Docker (e.g., `uvicorn` direct).
> When running via `docker compose up` or on Fly, env vars come from the root
> `.env` or Fly secrets respectively, and `api/.env` is not needed.

---

## Step 2 — Local sanity check (optional but recommended)

Build and run both services with one command:

```bash
docker compose up --build
```

In another terminal, verify both services answer:

```bash
curl http://localhost:8000/healthz
# Expected: {"status":"ok","service":"robot-api", ...}
```

```bash
curl http://localhost:3000/api/health
# Expected: {"status":"ok","service":"acme-dashboard"}
```

Open `http://localhost:3000` in a browser. You should see the dashboard
shell. (Charts will be empty until the Twin has data — that comes in Step 7.)

When you are satisfied, stop the stack:

```bash
docker compose down
```

---

## Step 3 — Provision the HappyRobot Twin (canonical store)

The "Twin" is a managed Postgres instance that HappyRobot provisions per-org.
You don't create it manually — it appears the moment you create your first
workflow in the HR UI. All schema and seed data are applied via HR's
`POST /api/v2/twin/sql` REST endpoint.

> **Important:** HR sits behind Cloudflare WAF, which rejects multi-statement
> SQL. Issue **one statement per HTTP call** — do not concatenate `CREATE TABLE`
> blocks separated by `;`.

Set a couple of helpers so the curl examples are short:

```bash
export HR_KEY="sk_live_xxx_replace_me"
export HR_BASE="https://platform.happyrobot.ai/api/v2"   # use eu.platform.happyrobot.ai for EU orgs
```

PowerShell:

```powershell
$env:HR_KEY  = "sk_live_xxx_replace_me"
$env:HR_BASE = "https://platform.happyrobot.ai/api/v2"
```

Apply each schema file. Each file in this repo contains a single `CREATE TABLE`
statement, so you can pipe each one directly:

```bash
for f in data/twin_schema_loads.sql data/twin_schema_calls_log.sql data/twin_schema_v15_bookings.sql; do
  echo ">> applying $f"
  curl -sS -X POST "$HR_BASE/twin/sql" \
    -H "Authorization: Bearer $HR_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -Rs '{query: .}' < "$f")"
done
```

PowerShell equivalent:

```powershell
foreach ($f in @(
  "data/twin_schema_loads.sql",
  "data/twin_schema_calls_log.sql",
  "data/twin_schema_v15_bookings.sql"
)) {
  Write-Host ">> applying $f"
  $body = @{ query = (Get-Content -Raw $f) } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$env:HR_BASE/twin/sql" `
    -Headers @{ Authorization = "Bearer $env:HR_KEY"; "Content-Type" = "application/json" } `
    -Body $body
}
```

Now seed the loads catalog:

```bash
curl -sS -X POST "$HR_BASE/twin/sql" \
  -H "Authorization: Bearer $HR_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rs '{query: .}' < data/twin_seed_loads_v2.sql)"
```

Sanity check — the seed should produce ~30 rows:

```bash
curl -sS -X POST "$HR_BASE/twin/sql" \
  -H "Authorization: Bearer $HR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT COUNT(*) FROM loads"}'
# Expected: a JSON body with a count near 30
```

---

## Step 4 — Set up the HappyRobot workflow

The voice-agent prompt, FMCSA verification, negotiation sidecar, and post-call
extraction all live inside HappyRobot — they are configured in the HR UI, not
in this repo. The repo's job is to host the API the workflow calls and the
dashboard that visualizes the results.

You have two paths:

**(a) Fork the canonical workflow (fastest).**
Request access to the published workflow at
https://platform.happyrobot.ai/fdeandresnavarro/workflows/xsfvbpjpsoy4/editor/c8yjoguc8i4t
("Inbound Carrier Sales New") and fork it into your org. All nodes, prompts,
and tools come pre-wired.

**(b) Build it from scratch.** Use `docs/broker-doc.md` (the broker spec) as
the functional contract and follow `docs/iac/ui-build-guide.md` for click-by-click
node assembly.

Once your workflow exists:

1. **Workflow Settings -> Variables** — set:

   | Variable                          | Value      |
   |-----------------------------------|------------|
   | `agent_name`                      | e.g. `Riley` |
   | `company_name`                    | Your brokerage name |
   | `negotiation_ceiling_multiplier`  | `1.10` (means broker will pay up to 10% above listed; range 1.00–1.50) |
   | `max_negotiation_rounds`          | `3` |

2. **Workflow Settings -> Secrets** — add `API_BEARER_TOKEN` with the
   **same value** you generated in Step 1. The HR `book_load` and `log_call`
   tools include this in the `Authorization` header when they hit your API.

3. **Web-Call trigger node** — copy the auto-generated `wss://` URL. This is
   what carriers (or you, in Step 7) will dial to start a call.

---

## Step 5 — Deploy the API to Fly

Authenticate:

```bash
flyctl auth login
```

Create the API app. Pick a globally unique name — Fly app names are global:

```bash
flyctl apps create robot-api-<your-handle>
```

Open `fly.toml` (at the **repo root** — this is the API's config; the
dashboard has its own `fly.toml` inside `dashboard/`) and update the
`app = ` line near the top:

```toml
app = "robot-api-<your-handle>"
```

Set Fly secrets. These are injected as env vars at runtime — never bake them
into the image:

```bash
flyctl secrets set \
  API_BEARER_TOKEN=<same-token-as-root-.env> \
  HAPPYROBOT_API_KEY=<your-sk_live_...> \
  FMCSA_WEB_KEY=<your-40-char-fmcsa-key> \
  -a robot-api-<your-handle>
```

PowerShell uses the same syntax — just keep it on one line or use backticks
for continuation.

**Deploy via the sanctioned script.** Do *not* run a bare `flyctl deploy`
from the repo root for either app — see Troubleshooting for why.

```bash
# macOS / Linux
bash scripts/deploy-api.sh
```

```powershell
# Windows
pwsh scripts/deploy-api.ps1
```

The script `cd`s into the repo root, runs `flyctl deploy --remote-only --app
robot-api-andres-morones`, then verifies the deployed image responds with the
`"service":"robot-api"` health fingerprint. **If you renamed the app**, edit
the `APP=` line at the top of both deploy-api scripts before running them, or
the verification will hit the wrong URL.

Verify by hand:

```bash
curl https://<your-api-name>.fly.dev/healthz
# Expected: {"status":"ok","service":"robot-api", ...}
```

---

## Step 6 — Deploy the Dashboard to Fly

Create the dashboard app:

```bash
flyctl apps create acme-dashboard-<your-handle>
```

Edit `dashboard/fly.toml` and update the `app = ` line near the top:

```toml
app = "acme-dashboard-<your-handle>"
```

Set Fly secrets. The bearer must match the API's; the API URL is the public
URL you confirmed in Step 5:

```bash
flyctl secrets set \
  API_BEARER_TOKEN=<same-token-as-API> \
  API_BASE_URL=https://robot-api-<your-handle>.fly.dev \
  LINK_SIGNING_SECRET=<your-second-openssl-output> \
  -a acme-dashboard-<your-handle>
```

Deploy via the sanctioned script:

```bash
# macOS / Linux
bash scripts/deploy-dashboard.sh
```

```powershell
# Windows
pwsh scripts/deploy-dashboard.ps1
```

As with the API script, edit the `APP=` line if you renamed the app. The
script `cd`s into `dashboard/` before deploying — this is critical (see
Troubleshooting).

Verify:

```bash
curl https://<your-dashboard-name>.fly.dev/api/health
# Expected: {"status":"ok","service":"acme-dashboard"}
```

Then open `https://<your-dashboard-name>.fly.dev` in a browser.

---

## Step 7 — End-to-end smoke test

Open the **Web-Call URL** you copied from the HR Web-Call trigger node in
Step 4. Place a single test call, speaking aloud:

> "Hi, MC 1234567, looking for a load."

Expected sequence inside the call:

1. Agent greets you, asks for your MC.
2. Agent calls FMCSA via the `verify_carrier` tool — should respond within
   ~2 seconds with a carrier name.
3. Agent asks for origin / destination / equipment, calls `query_loads`,
   pitches the first match.
4. You accept ("Sounds good, book it").
5. Agent calls `book_load`, then mock-transfers to a sales rep.

Within ~60 seconds of the call ending, the row should appear on the
**Calls** tab of the dashboard, and the booking should land on the
**Sales Pipeline** board. The **Funnel**, **Economics**, and **Operational**
tabs will update on their next 30-second revalidation.

---

## Troubleshooting

**"Bare `flyctl deploy` from the repo root shipped the API image to the
dashboard app."**
The repo root contains the API's `fly.toml`. If you `cd dashboard && flyctl
deploy`, Fly correctly uses `dashboard/fly.toml` — but if you stay at the
root, `flyctl` walks up looking for a `fly.toml`, finds the API one, and
ships the API image to whichever `--app` you passed. Always use
`scripts/deploy-{api,dashboard}.{sh,ps1}` — they self-`cd` to the right
directory and verify the deployed image fingerprint after deploy.

**"Cloudflare WAF on the Twin REST endpoint blocks my SQL."**
Cloudflare's managed-rules layer in front of HR rejects `ORDER BY ... LIMIT`,
multi-aggregate queries, large `IN (...)` lists, and `UNION`. For dashboard
reads, the API works around this by pulling raw rows and aggregating
Python-side. For ad-hoc queries during deploy, keep statements simple and
issue one `CREATE TABLE` per request.

**"Dashboard returns 401 on every request to the API."**
The `API_BEARER_TOKEN` differs between the two Fly apps. Re-issue
`flyctl secrets list -a <app>` on each side, regenerate the token, and
`fly secrets set` it on both apps and in HR Workflow Settings -> Secrets.
After updating, both apps will redeploy automatically.

**"MCP server can't read `HAPPYROBOT_API_KEY`."**
The repo's `.mcp.json` references `${HAPPYROBOT_API_KEY}` from the *launching
shell's* environment, not from `api/.env`. `export HAPPYROBOT_API_KEY=...`
in your shell profile (or run `source api/.env` before starting Claude Code).
A blank value silently produces 401s from every MCP call.

**"Twin schema reload after a `CREATE TABLE`."**
HR caches the Twin's schema for query planning. After applying a new DDL
statement, POST a small no-op or wait ~30s for the cache to refresh. If
queries continue to report "table not found", contact HR support to bust
the cache server-side.

**"FMCSA verify returns null for known-good MC numbers."**
The FMCSA QCMobile endpoint at `/qc/services/carriers/{n}` takes **DOT**
numbers. For **MC** numbers, use `/qc/services/carriers/docket-number/{n}`.
This is configured inside the HR `verify_carrier` webhook node, not in this
repo — check the URL in the HR workflow editor.

**"Healthcheck fails right after deploy."**
The API needs ~10s to boot uvicorn + warm the loads CSV cache; the dashboard
needs ~5s. The Fly healthchecks have a `grace_period` set to cover this. If
checks still fail, run `flyctl logs -a <app>` and look for the actual stack
trace — the most common cause is a missing secret.

---

## Cost expectations

Fly.io's free allowance covers two always-warm `shared-cpu-1x / 512MB`
machines (one per app), which is the configuration shipped here. For demo
traffic (< 100 calls/day, < 1k dashboard requests/day) total cost is
effectively $0/month. The HR Twin is included in the HR free tier and the
FMCSA WebKey is free. Expect to start paying only if you scale past one
machine per app or add a persistent volume — neither is needed for this
deployment.

---

## Tear down

```bash
flyctl apps destroy robot-api-<your-handle>
flyctl apps destroy acme-dashboard-<your-handle>
```

The Twin tables can be dropped from the HR UI (Workflows -> Twin -> right-click
the table) or via SQL:

```bash
for t in bookings calls_log loads; do
  curl -sS -X POST "$HR_BASE/twin/sql" \
    -H "Authorization: Bearer $HR_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"DROP TABLE IF EXISTS $t\"}"
done
```

Delete the HR workflow itself from the HR UI (Workflows list -> trash icon).
That's the full undo.
