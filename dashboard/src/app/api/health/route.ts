// Fly healthcheck (`/api/health` in fly.toml) hits this every few seconds — `force-static` keeps it free of
// per-request work so a slow upstream can't cascade into a machine restart loop.
export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET() {
  return Response.json({ status: "ok", service: "acme-dashboard" });
}
