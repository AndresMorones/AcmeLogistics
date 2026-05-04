# Acme Logistics Dashboard

Next.js 15 + Tailwind + shadcn/ui dashboard for the HappyRobot inbound
carrier voice agent. Reads the FastAPI service at `/v1/dashboard/*` from a
Server Component using a server-only Bearer token.

## Stack

- Next.js 15 App Router (Server Components for all data fetching)
- TypeScript, React 19
- Tailwind CSS + shadcn-style primitives (in-tree at `src/components/ui/`)
- Recharts for charts
- `openapi-typescript` for typed API surface (run `npm run gen:types`)

## Local development

```bash
cd dashboard
npm install
cp .env.example .env.local
# Edit .env.local — set API_BEARER_TOKEN and (optionally) API_BASE_URL
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Env vars

| Variable | Required | Default | Notes |
|---|---|---|---|
| `API_BEARER_TOKEN` | yes | — | Server-only. Same token as Fly secret on the API. Never exposed to the browser. |
| `API_BASE_URL` | no | `https://robot-api-andres-morones.fly.dev` | FastAPI service URL. |

The token is read via `src/lib/config.ts`, which is `import "server-only"` —
attempting to import it from a Client Component fails the Next.js build.

## Verification

```bash
# Type-check
npx tsc --noEmit

# Lint
npm run lint

# Dev server
npm run dev

# Production build (sanity-check before deploy)
npm run build && npm start
```

## Pages

| Path | Renders |
|---|---|
| `/` | Redirects to `/dashboard` |
| `/dashboard` | Funnel header strip + monitor tabs (Economics · Operational · Quality · Telemetry) |
| `/dashboard/calls` | Call-log table with sentiment/CHS/outcome badges + per-row drilldown link |
| `/dashboard/calls/[call_id]` | Per-call detail — transcript, bookings, telemetry |
| `/dashboard/carriers` | Per-MC rollup table |
| `/dashboard/sales` | Sales pipeline board for new bookings |

## Deploy to Fly.io

Always use the wrapper script — a bare `flyctl deploy` from the repo root
ships the API image to the dashboard app. See root `DEPLOY.md` for the why
and the full first-time secrets walkthrough.

```bash
# macOS / Linux
bash scripts/deploy-dashboard.sh

# Windows
pwsh scripts/deploy-dashboard.ps1
```

Verify:

```bash
curl https://acme-dashboard-andres-morones.fly.dev/api/health
fly status -a acme-dashboard-andres-morones
fly logs   -a acme-dashboard-andres-morones
```

## Architecture notes

- **Bearer never reaches the browser.** All `/v1/*` fetches happen in Server
  Components via `src/lib/api-client.ts`, which imports `server-only`.
- **Revalidation** is set to 30 s on each page; pair with `force-dynamic`
  during early demos so the dashboard always reflects the latest call.
- **Charts** use a single-hue blue ramp + small accent set, matching the
  shadcn theme. No rainbow palettes.
- **Tables** are client-side sortable (no server-side query params yet —
  good enough for the MVP dataset).

