import Link from "next/link";

import type { CallRecord } from "@/types/api-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtRelative } from "@/lib/format";
import { isFlagged } from "@/lib/chs-thresholds";

const ROW_LIMIT = 10;

export function LowChsCalls({ calls }: { calls: CallRecord[] }) {
  // Flagged predicate sourced from chs-thresholds (single source of truth across
  // headline / drilldown / this list). Sort newest-first so the most recent
  // misses surface at the top of the capped 10-row preview.
  const flagged = calls
    .filter((c) => isFlagged(c.case_health_score))
    .sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return tb - ta;
    })
    .slice(0, ROW_LIMIT);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          Low CHS calls
        </CardTitle>
      </CardHeader>
      <CardContent>
        {flagged.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No flagged calls in this window.
          </p>
        ) : (
          <ul className="space-y-2">
            {flagged.map((c) => (
              <li
                key={c.call_id ?? `${c.id}`}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <Link
                  href={
                    c.call_id
                      ? `/dashboard/calls/${encodeURIComponent(c.call_id)}`
                      : "#"
                  }
                  className="truncate font-mono text-foreground hover:text-primary"
                >
                  {c.mc_number ? `MC ${c.mc_number}` : c.call_id ?? "—"}
                </Link>
                <span className="shrink-0 tabular-nums text-destructive">
                  CHS {c.case_health_score ?? "—"}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {fmtRelative(c.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
