# Architecture

Acme Logistics is an inbound carrier voice agent for a freight brokerage. A carrier dials in via the HappyRobot platform; the agent verifies the carrier against FMCSA, searches active loads in a managed Postgres ("HR Twin"), negotiates within a per-call ceiling above the listed rate, books the load mid-call, and hands off to a sales rep. A separate Next.js dashboard surfaces funnel, economics, operational, and quality KPIs against the same store. The runtime is two Fly.io apps (FastAPI + Next.js, both in IAD) plus the HappyRobot platform itself (which hosts the voice agent, post-call extraction, and the Twin Postgres).

**Contents.** [System overview](#1-system-overview) · [Tools](#2-tools) · [Key invariants](#3-key-invariants) · [Tech stack](#4-tech-stack) · [Data model](#5-data-model) · [API contract](#6-api-contract) · [Caching](#7-caching) · [Security model](#8-security-model) · [Local development](#9-local-development) · [Glossary](#10-glossary)

---

## 1. System overview

```
   ┌──────────────────┐
   │ Carrier browser  │ ── WebRTC ──┐
   │  (web-call URL)  │             │
   └──────────────────┘             ▼
   ┌─────────────────────────────────────────────────────────┐
   │ HappyRobot platform                                     │
   │                                                         │
   │      ┌──────────────────┐                               │
   │      │  Voice Agent     │                               │
   │      │  + Prompt        │                               │
   │      └────────┬─────────┘                               │
   │               │                                         │
   │   ┌──────┬────┼──────┬──────────┬──────────┐           │
   │   ▼      ▼    ▼      ▼          ▼          ▼           │
   │ verify query negotiate  book   get_current_time         │
   │   │      │      │      │          │                    │
   │   ▼      ▼      ▼      ▼          ▼                    │
   │ FMCSA  Twin   Python  Twin     Python                   │
   │ HTTPS  READ   sidecar WRITE    helper                   │
   │               + Adjust (chip)                           │
   │               Terms                                     │
   │                                                         │
   │   post-call ──▶ AI Extract + CHS ──▶ Write-to-Twin     │
   │                                            │            │
   │                                            ▼            │
   │                       ┌────────────────────────────┐    │
   │                       │ HR Twin Postgres           │    │
   │                       │ loads / calls_log /        │    │
   │                       │ bookings                   │    │
   │                       └────────────────────────────┘    │
   │                                                         │
   │   POST /v1/events/call-ended ──────────┐                │
   └────────────────────────────────────────┼────────────────┘
                                           ▼
            ┌──────────────────────────────────────────┐
            │ Fly.io IAD                                │
            │                                           │
            │   ┌──────────────────────┐                │
            │   │ FastAPI service      │                │
            │   │ Bearer auth +        │                │
            │   │ TTLCache(30s)        │                │
            │   │ on call.ended:       │                │
            │   │   bookkeeping +      │                │
            │   │   cache invalidate + │                │
            │   │   SSE fan-out        │                │
            │   └──────────┬───────────┘                │
            │              │ Twin REST (HTTPS)          │
            │              ▼                            │
            │       HR Twin Postgres                    │
            │                                           │
            │   ┌──────────────────────┐                │
            │   │ Dashboard (Next.js)  │ ◀── SSE ──┐    │
            │   │ Server Components    │ ── Bearer ┘    │
            │   │ + ISR(30s)           │ fetch          │
            │   └──────────┬───────────┘                │
            └──────────────┼───────────────────────────┘
                           │ HMAC-signed link
                           ▼
                ┌──────────────────┐
                │ Sales rep browser│
                └──────────────────┘
```

---

## 2. Tools

The Voice Agent calls five tools during a call:

| Tool | What it does |
|---|---|
| `verify_carrier` | HTTPS webhook to FMCSA QCMobile; runs the 8-check AND-gate on the response. |
| `query_loads` | HTTPS read against HR Twin for active loads matching origin / destination / equipment / pickup window. |
| `negotiate_rate` | Run Python pre-processor computes the per-round ceiling, then an Adjust Terms Agreement classifier returns a branch decision (`accept` / `between` / `above`) plus a verbatim phrase. |
| `book_load` | HTTPS write to HR Twin via Write-to-Twin chip; `UNIQUE (call_id, load_id)` makes it idempotent. |
| `get_current_time` | Run Python helper returning canonical UTC; the prompt never has to guess the date. |

Post-call: an AI Extract node + Case Health Score node populate `calls_log` via a Write-to-Twin chip and POST `call.ended` to FastAPI.

---

## 3. Key invariants

- **FMCSA 8-check AND-gate** runs before any load talk; any failure routes to a named decline script and ends the call.
- **`max_value` never reaches the agent.** The pre-processor computes the dollar ceiling and the agent receives only a branch decision plus a verbatim phrase.
- **Direction is upward.** Carriers counter up from listed; the agent accepts at-or-below listed, negotiates between listed and ceiling, re-anchors above ceiling.
- **`book_load` is mid-call and idempotent.** A `UNIQUE (call_id, load_id)` constraint absorbs retries.
- **From FastAPI, `bookings` and `calls_log` are read-only** — every write originates inside HR.

---

## 4. Tech stack

Python 3.12 + FastAPI + `uv` on the backend; Next.js 15 App Router (RSC) + Tailwind 4 + shadcn/ui + Recharts on the frontend; `openapi-typescript` generates TS types from the FastAPI OpenAPI schema at build time. Both apps run as one machine each on Fly.io IAD. Logs are structlog JSON; OpenTelemetry and `prometheus_client` are instrumented but unwired.

---

## 5. Data model

Three tables in HR Twin Postgres:

| Table | Grain | Written by |
|---|---|---|
| `loads` | One row per load. Lifecycle columns (`status`, `booked_at`) flipped by FastAPI on `call.ended`. | Seed import; FastAPI |
| `bookings` | One row per booking; written mid-call when `book_load` fires. | HR Write-to-Twin chip |
| `calls_log` | One row per call; written post-call after AI Extract + CHS. | HR Write-to-Twin chip |

DDL: `data/twin_schema_loads.sql`, `data/twin_schema_loads_status.sql`, `data/twin_schema_calls_log.sql`, `data/twin_schema_bookings.sql`. `loads.pickup_datetime` and `delivery_datetime` are `TEXT` ISO 8601 (`YYYY-MM-DDTHH:MM:SSZ`) so the Twin chip's substring `LIKE` filter can drive date-prefix pickup-window matches.

---

## 6. API contract

All `/v1/*` endpoints require `Authorization: Bearer <token>` OR `x-api-key: <token>` (constant-time compare). `/healthz` and `/docs` are unauthenticated.

```
GET  /v1/loads/{reference_number}                Loads
GET  /v1/loads/search?origin_state=&...
GET  /v1/calls, /v1/calls/{id}, /v1/calls/active Calls
GET  /v1/carriers, /v1/carriers/{mc_number}      Per-MC rollup
GET  /v1/dashboard/{funnel|economics|operational Dashboard
     |quality|calls|loads|telemetry}             aggregates (30s TTL)
POST /v1/events/call-ended                       Webhook receiver
POST /v1/events/session                          Mints SSE session token
GET  /v1/events/stream?session=...               SSE stream
```

---

## 7. Caching

Two 30-second in-process layers: Next.js ISR (`revalidate=30`) per dashboard page, and `cachetools.TTLCache(ttl=30s, maxsize=128)` per FastAPI aggregation. The `call.ended` webhook calls `invalidate_dashboard_cache()` so a fresh call shows up immediately; worst-case staleness without the webhook is ~60s.

---

## 8. Security model

Three independent secrets, three independent blast radii:

| Secret | Authenticates |
|---|---|
| `HAPPYROBOT_API_KEY` | FastAPI → HR Twin |
| `API_BEARER_TOKEN` | Dashboard server → FastAPI |
| `LINK_SIGNING_SECRET` | Email recipient → dashboard (HMAC-signed URL) |

Auth flow: HMAC-signed URL → dashboard middleware sets cookie → server-side fetch with Bearer header → FastAPI constant-time compare → Twin REST over HTTPS.

Hardening: header-only auth (no `?token=` fallback); `scrub_secrets_processor` redacts the HR key prefix, `Bearer <token>`, and the literal `API_BEARER_TOKEN` before structlog's JSON renderer; generic 500 handler returns `{"detail": "Internal server error", "request_id": "<uuid>"}`; request middleware drops `authorization` / `x-api-key` / `cookie` before they bind to contextvars; `GET /v1/calls/{call_id}` defaults `include_transcript=False`.

The negotiation ceiling is computed inside the HR Run Python pre-processor and consumed by the Adjust Terms node — the Voice Agent Prompt never receives the number, so prompt-injection cannot extract it.

Known limitations: no rate limit, no WAF on FastAPI itself, no mutual TLS, no rotation script, no audit log beyond structlog stdout.

---

## 9. Local development

```powershell
# Prereqs: Python 3.12, uv, Node 18+
cp api/.env.example api/.env
cp dashboard/.env.example dashboard/.env.local
# Fill HAPPYROBOT_API_KEY and a matching API_BEARER_TOKEN in both files.
cd api && uv sync && uv run uvicorn app.main:app --reload --port 8000
cd dashboard && npm install && npm run dev
```

API at `http://localhost:8000`, dashboard at `http://localhost:3000`. The Bearer must match across both `.env` files or every dashboard request returns 401. The `call.ended` webhook is reachable from your laptop only via `curl` or a tunnel (`cloudflared` / `ngrok`).

---

## 10. Glossary

| Term | Definition |
|---|---|
| **Twin** | HappyRobot-managed Postgres exposed via REST. Source of truth for `loads`, `calls_log`, `bookings`. |
| **MC** | Motor Carrier number — primary US trucking authority identifier. |
| **FMCSA** | Federal Motor Carrier Safety Administration. Public API at `mobile.fmcsa.dot.gov/qc/services/carriers/{mc}`. |
| **CHS** | Case Health Score. 0–100 quality score from an HR LLM node post-call; pass ≥70. |
| **Adjust Terms Agreement** | HR classifier node that takes a computed ceiling plus the carrier's counter and routes to accept / between / above. |
| **ISR** | Incremental Static Regeneration. Next.js cache mode; `revalidate=30` re-renders the page at most every 30s. |
| **SSE** | Server-Sent Events. One-way HTTP streaming used for the live-refresh nudge from `call.ended`. |
