import "server-only";

import { NextResponse } from "next/server";

import { getCalls } from "@/lib/api-client";

// Cmd-K palette source: 50 most-recent calls. Cap is owned here; the palette
// caches client-side per session, so do NOT add revalidate (would double-cache)
// and do NOT raise 50 without coordinating with the palette's fetch logic.
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const { calls } = await getCalls(50);
    return NextResponse.json({ calls });
  } catch (err) {
    // Structured log + canonical error shape; UI keeps empty fallback.
    console.error(
      JSON.stringify({
        event: "proxy_error",
        fn: "GET /api/cmdk/calls",
        code: "upstream_error",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return NextResponse.json(
      { calls: [], error: "Upstream service error", code: "upstream_error" },
      { status: 502 },
    );
  }
}
