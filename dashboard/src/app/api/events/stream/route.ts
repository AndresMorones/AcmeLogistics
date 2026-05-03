import "server-only";

import type { NextRequest } from "next/server";

import { apiBaseUrl } from "@/lib/config";

// SSE pass-through: stream upstream `body` byte-for-byte so backpressure + abort propagate end-to-end;
// `runtime=nodejs` because the Edge runtime can't pipe a long-lived ReadableStream through fetch reliably.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const session = req.nextUrl.searchParams.get("session");
  if (!session) {
    return new Response(
      JSON.stringify({ error: "Missing session parameter", code: "missing_param" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${apiBaseUrl}/v1/events/stream?session=${encodeURIComponent(session)}`,
      {
        method: "GET",
        headers: { accept: "text/event-stream" },
        cache: "no-store",
        signal: req.signal,
      },
    );
  } catch (err) {
    // Log details server-side; canonical `{error, code}` body — never echo `String(err)` to the client.
    console.error(
      JSON.stringify({
        event: "proxy_error",
        fn: "GET /api/events/stream",
        code: "upstream_unreachable",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return new Response(
      JSON.stringify({
        error: "Upstream service unreachable",
        code: "upstream_unreachable",
      }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  if (!upstream.ok || !upstream.body) {
    // Don't forward raw upstream text — could leak stack traces or internal IDs to the browser.
    const upstreamStatus = upstream.status || 502;
    console.error(
      JSON.stringify({
        event: "proxy_error",
        fn: "GET /api/events/stream",
        code: "upstream_non_2xx",
        status: upstreamStatus,
      }),
    );
    return new Response(
      JSON.stringify({ error: "Upstream service error", code: "upstream_non_2xx" }),
      {
        status: upstreamStatus,
        headers: { "content-type": "application/json" },
      },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
