// `server-only` throws at import time if pulled into a Client Component bundle —
// guarantees API_BEARER_TOKEN can never leak into browser JS.
import "server-only";

export const apiBaseUrl =
  process.env.API_BASE_URL?.replace(/\/$/, "") ??
  "https://robot-api-andres-morones.fly.dev";

export const apiBearerToken = process.env.API_BEARER_TOKEN ?? "";

if (!apiBearerToken && process.env.NODE_ENV === "production") {
  // Log-don't-throw: static pages and zero-state UI must still render so
  // partial-failure modes stay inspectable in Fly logs; per-request handlers
  // re-check the token and return canonical 401/500.
  console.error(
    JSON.stringify({
      event: "config_error",
      fn: "config.module",
      message:
        "API_BEARER_TOKEN not set — /v1/dashboard/* fetches will return 401/500",
    }),
  );
}
