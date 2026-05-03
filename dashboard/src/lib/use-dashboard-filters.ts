"use client";

import { useCallback, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

const DAY_MS = 86400000;

// URL is the single source of truth for filter state — share-links and back/forward
// reproduce the same view without local storage. `<input type="date">` returns a
// bare YYYY-MM-DD string with no TZ; we interpret it as UTC midnight so server
// (Fly), client (any viewer TZ), and Twin (UTC) align byte-for-byte.
function startOfDayUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function endOfDayUTC(d: Date): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function parseISODate(s: string | null): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0),
  );
  return isNaN(d.getTime()) ? null : d;
}

function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function useDashboardFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const fromString = params.get("from") ?? "";
  const toString = params.get("to") ?? "";

  // Memo on raw param strings is load-bearing: without it, fresh Date refs each
  // render infinite-loop any consumer that puts `filters.from` in a useEffect dep.
  // Default window = last 7 days ending today; bad/missing params silently fall
  // back rather than throw, so stale share-links stay usable.
  const filters = useMemo(() => {
    const fromParam = parseISODate(fromString || null);
    const toParam = parseISODate(toString || null);
    const now = new Date();
    return {
      from: fromParam
        ? startOfDayUTC(fromParam)
        : startOfDayUTC(new Date(now.getTime() - 7 * DAY_MS)),
      to: toParam ? endOfDayUTC(toParam) : endOfDayUTC(now),
    };
  }, [fromString, toString]);

  // router.push triggers a full Server Component refetch — `from`/`to` propagate
  // through the Next.js -> FastAPI fetch chain to bound the SQL window.
  const setFilters = useCallback(
    (next: { from: Date; to: Date }) => {
      const sp = new URLSearchParams();
      if (fromString) sp.set("from", fromString);
      if (toString) sp.set("to", toString);
      sp.set("from", toISODate(next.from));
      sp.set("to", toISODate(next.to));
      router.push(`${pathname}?${sp.toString()}`);
    },
    [router, pathname, fromString, toString],
  );

  return { filters, setFilters };
}
