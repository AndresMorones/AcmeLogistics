import "server-only";

import { NextResponse } from "next/server";

import { apiBaseUrl, apiBearerToken } from "@/lib/config";

// Server-side proxy for the active-call indicator (browser polls every 10s with
// no Bearer). Token is injected here so it never enters the client bundle;
// upstream FastAPI owns a 10s TTLCache, so this route stays a pure passthrough
// (no local revalidate) to avoid double-caching.
export const dynamic = "force-dynamic";

// Canonical error shape across all proxy routes: { error, code? }.
// Keep generic; never echo raw upstream error text to clients (leaks internals).
// Routes returning data alongside errors keep their data fields for UI fallback.
export async function GET(): Promise<NextResponse> {
  if (!apiBearerToken) {
    console.error(
      JSON.stringify({
        event: "proxy_error",
        fn: "GET /api/calls/active",
        code: "config_missing_token",
        message: "API_BEARER_TOKEN unset",
      }),
    );
    // Preserve UI-friendly empty payload so the indicator zero-state renders.
    return NextResponse.json(
      {
        count: 0,
        runs: [],
        status: "error",
        error: "Service unavailable",
        code: "config_missing_token",
      },
      { status: 500 },
    );
  }
  try {
    const upstream = await fetch(`${apiBaseUrl}/v1/calls/active`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiBearerToken}`,
      },
      cache: "no-store",
    });
    if (!upstream.ok) {
      console.error(
        JSON.stringify({
          event: "proxy_error",
          fn: "GET /api/calls/active",
          code: "upstream_non_2xx",
          status: upstream.status,
        }),
      );
      return NextResponse.json(
        { count: 0, runs: [], status: "error", error: "Upstream service error", code: "upstream_non_2xx" },
        { status: upstream.status },
      );
    }
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "proxy_error",
        fn: "GET /api/calls/active",
        code: "upstream_unreachable",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return NextResponse.json(
      { count: 0, runs: [], status: "error", error: "Upstream service unreachable", code: "upstream_unreachable" },
      { status: 502 },
    );
  }
}
