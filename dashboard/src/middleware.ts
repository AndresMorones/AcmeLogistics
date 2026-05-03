import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Token format: `{exp_unix_seconds}.{hmac_sha256_hex}` — HMAC computed over the
// exp string with this secret. Companion generator lives in scripts/generate_signed_link.py.
const SECRET = process.env.LINK_SIGNING_SECRET ?? "";
const COOKIE_NAME = "dash_auth";

function hexFromBuffer(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Web Crypto (SubtleCrypto) — Node's `crypto` module is unavailable in the
// Edge runtime that hosts Next.js middleware, so HMAC must go through this path.
async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return hexFromBuffer(sig);
}

// Constant-time compare — `===` short-circuits on first mismatched char and
// would leak signature bytes via response-time differences under attack.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function isValidToken(token: string | null | undefined): Promise<boolean> {
  if (!token || !SECRET) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [exp, sig] = parts;
  const expNum = Number(exp);
  if (!Number.isInteger(expNum) || expNum <= 0) return false;
  if (Date.now() / 1000 > expNum) return false;
  const expected = await hmacHex(SECRET, exp);
  return timingSafeEqual(sig, expected);
}

// Fail-closed if the signing secret is missing — without it every signature
// would silently verify (or every request would 401), so refuse to serve at all.
export async function middleware(req: NextRequest) {
  if (!SECRET) {
    console.error(
      JSON.stringify({
        event: "middleware_auth_misconfigured",
        reason: "LINK_SIGNING_SECRET missing or empty",
      }),
    );
    return new NextResponse("Service unavailable - auth misconfigured", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const url = req.nextUrl;
  const queryToken = url.searchParams.get("t");
  const cookieToken = req.cookies.get(COOKIE_NAME)?.value;

  const queryOk = await isValidToken(queryToken);
  const cookieOk = await isValidToken(cookieToken);

  // First click via `?t=...`: validate, drop the token into an httpOnly cookie,
  // then redirect to a clean URL so the signed link does not linger in browser
  // history, referrer headers, or shareable screenshots. Cookie maxAge mirrors
  // the token's own exp so logout aligns with link expiry.
  if (queryOk && queryToken) {
    const cleanUrl = url.clone();
    cleanUrl.searchParams.delete("t");
    const res = NextResponse.redirect(cleanUrl);
    const expSec = Number(queryToken.split(".")[0]);
    const maxAge = Math.max(0, expSec - Math.floor(Date.now() / 1000));
    res.cookies.set(COOKIE_NAME, queryToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge,
    });
    return res;
  }

  if (cookieOk) {
    return NextResponse.next();
  }

  return new NextResponse(
    "Access requires a valid signed link. Contact the operator for a new link.",
    {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    },
  );
}

// CRITICAL: matcher must skip `/api/*` (incl. `/api/health`) — if middleware
// 401'd the platform healthcheck the host would loop-restart the machine.
// Static assets are also carved out so signed-link auth only gates HTML routes.
export const config = {
  matcher: ["/((?!api/|_next/|favicon|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?|ttf)).*)"],
};
