import "server-only";

import { NextResponse } from "next/server";

import { apiBaseUrl, apiBearerToken } from "@/lib/config";

// One-shot session-token mint: client POSTs once, then opens the EventSource GET with the token in the query string
// (EventSource can't send Authorization headers, so the bearer stays server-side and the token is the only thing on the wire).
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  if (!apiBearerToken) {
    console.error(
      JSON.stringify({
        event: "proxy_error",
        fn: "POST /api/events/session",
        code: "config_missing_token",
        message: "API_BEARER_TOKEN not configured",
      }),
    );
    return NextResponse.json(
      { error: "Service unavailable", code: "config_missing_token" },
      { status: 500 },
    );
  }
  try {
    const upstream = await fetch(`${apiBaseUrl}/v1/events/session`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiBearerToken}`,
      },
      cache: "no-store",
    });
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    // Log details server-side; canonical `{error, code}` body — never echo `String(err)` to the client.
    console.error(
      JSON.stringify({
        event: "proxy_error",
        fn: "POST /api/events/session",
        code: "upstream_unreachable",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return NextResponse.json(
      { error: "Upstream service unreachable", code: "upstream_unreachable" },
      { status: 502 },
    );
  }
}
