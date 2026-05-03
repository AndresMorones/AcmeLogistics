import "server-only";

import { NextResponse } from "next/server";

import { getCarriers } from "@/lib/api-client";

// Cmd-K source contract: `{rows}` shape mirrors cmdk/calls so the palette consumer is uniform.
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const rollup = await getCarriers();
    return NextResponse.json({ rows: rollup.top_carriers });
  } catch (err) {
    // Log details server-side; canonical `{error, code}` body — never echo `String(err)` to the client.
    console.error(
      JSON.stringify({
        event: "proxy_error",
        fn: "GET /api/cmdk/carriers",
        code: "upstream_error",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return NextResponse.json(
      { rows: [], error: "Upstream service error", code: "upstream_error" },
      { status: 502 },
    );
  }
}
