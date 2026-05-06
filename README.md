# Acme Logistics — Carrier Sales Voice Agent

> AI voice agent + ops dashboard for inbound carrier sales.

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-3.12-blue)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Deploy](https://img.shields.io/badge/deploy-Fly.io-purple)

---

## Submission deliverables

| # | Deliverable | Link |
|---|---|---|
| 1 | Email to Carlos Becker | _sent separately_ |
| 2 | Build description (broker-facing) | [`docs/broker-doc.md`](docs/broker-doc.md) |
| 3 | Live dashboard | https://acme-dashboard-andres-morones.fly.dev |
| 4 | Code repository | https://github.com/AndresMorones/AcmeLogistics |
| 5 | HappyRobot workflow | https://platform.happyrobot.ai/fdeandresnavarro/workflows/xsfvbpjpsoy4/editor/qa30cjwmki9d _(viewable by HappyRobot platform reviewers)_ |
| 6 | Walkthrough video (Loom, ~5 min) | _(link added at submission)_ |
| — | Live web call (try the demo) | https://platform.happyrobot.ai/deployments/xsfvbpjpsoy4/ma8ujkg36bkq |

The dashboard is read-only and safe to share. The web-call link drops you straight into an inbound conversation with the agent.

## What this is

Carriers dial an AI voice agent, get verified against the FMCSA in real time, hear matching loads from the broker's catalog, negotiate the rate up to three rounds, and get booked — all without a human picking up. Every call is captured (transcript, outcome, sentiment, agreed rate, MC, lane) and surfaced on a custom operations dashboard.

The voice agent itself runs on the [HappyRobot](https://happyrobot.ai) platform. This repository contains the supporting backend, the operations dashboard, the data schemas, and the deployment scripting that make the system reproducible end-to-end.

## Architecture at a glance

```
   ┌──────────────┐        ┌────────────────────────┐
   │   Carrier    │ ─────▶ │  HappyRobot platform   │
   │ (web call)   │        │  Voice Agent + 5 tools │
   └──────────────┘        └───────────┬────────────┘
                                       │
              ┌────────────────────────┼─────────────────────────┐
              ▼                        ▼                         ▼
         ┌─────────┐              ┌────────┐               ┌──────────┐
         │  FMCSA  │              │  Twin  │               │ Run      │
         │ verify  │              │  loads │               │ Python   │
         │ carrier │              │ /calls │               │ sidecar  │
         └─────────┘              │ /books │               │ negotiate│
                                  └───┬────┘               └──────────┘
                                      │
                                      │  Twin REST
                                      ▼
                          ┌──────────────────────┐
                          │  FastAPI service     │
                          │  (Fly.io, IAD)       │
                          │  Bearer-auth read    │
                          └──────────┬───────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │  Next.js dashboard   │
                          │  (Fly.io, IAD)       │ ──▶ Sales rep
                          └──────────────────────┘
```

Three independently deployable surfaces:

1. **HappyRobot workflow** — voice agent, prompts, the 5 tools, post-call extraction. Lives in HR (not in this repo).
2. **API service** — FastAPI, Bearer-authed read API over the HR Twin store.
3. **Dashboard service** — Next.js 15 server-rendered analytics on funnel, economics, operational, quality, and telemetry KPIs.

For the data flow, table layout, and security model, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Stack

FastAPI (Python 3.12) + Next.js 15 + HappyRobot Twin Postgres, deployed as two Fly.io apps fronted by the HappyRobot voice platform.

## Quick start (local)

You need Docker Desktop, a HappyRobot API key, and a chosen Bearer token.

```bash
git clone https://github.com/AndresMorones/AcmeLogistics.git
cd AcmeLogistics
cp .env.example .env       # then fill in API_BEARER_TOKEN + HAPPYROBOT_API_KEY
docker compose up --build
```

Then open:

- API:       http://localhost:8000  (Swagger at `/docs`)
- Dashboard: http://localhost:3000

For end-to-end Fly.io deployment (app create, secrets, smoke-test, HR-side wiring), see [`DEPLOY.md`](DEPLOY.md).

## Project structure

```
.
├── api/             FastAPI backend
├── dashboard/       Next.js 15 dashboard
├── data/            Twin DDL + loads catalog seed
├── docs/            Challenge spec + broker-facing build description
├── scripts/         Deploy wrappers
├── docker-compose.yml
├── README.md        This file
├── DEPLOY.md        End-to-end Fly.io deployment guide
└── ARCHITECTURE.md  Stack, data model, security
```

## Tests

```bash
cd api && uv sync && uv run pytest
```

Contract-style tests cover the auth boundary, loads endpoints, dashboard aggregations, the Twin client wrapper, dashboard caching, call/booking response shapes, FMCSA eligibility, and MC-number normalization.

## Built with

- [HappyRobot](https://happyrobot.ai) — voice platform, Twin Postgres gateway, Run Python sidecar
- [FMCSA QCMobile](https://mobile.fmcsa.dot.gov/qc) — public carrier verification API
- [Fly.io](https://fly.io) — container hosting and managed Let's Encrypt
- [Next.js 15](https://nextjs.org), [Tailwind 4](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com), [Recharts](https://recharts.org)
- [FastAPI](https://fastapi.tiangolo.com), [Pydantic v2](https://docs.pydantic.dev), [structlog](https://www.structlog.org), [uv](https://github.com/astral-sh/uv)

MIT — see [LICENSE](LICENSE).
