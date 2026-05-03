import type { CallRecord } from "@/types/api-types";
import { Card, CardContent } from "@/components/ui/card";
import { CHS_HEALTHY, CHS_PASS } from "@/lib/chs-thresholds";

type BucketKey = "85-100" | "70-85" | "0-70";

const ORDER: BucketKey[] = ["85-100", "70-85", "0-70"];

const COLORS: Record<BucketKey, string> = {
  "85-100": "#15803d",
  "70-85": "#b45309",
  "0-70": "#b91c1c",
};

const LABELS: Record<BucketKey, string> = {
  "85-100": "85–100",
  "70-85": "70–85",
  "0-70": "0–70",
};

// Buckets split at CHS_PASS (70) and CHS_HEALTHY (85) — the load-bearing
// pass/goal lines. Bucketed client-side because any pre-bucketed API
// distribution at fixed widths would lose those exact split points.
function bucketize(calls: CallRecord[]): Record<BucketKey, number> {
  const out: Record<BucketKey, number> = { "0-70": 0, "70-85": 0, "85-100": 0 };
  for (const c of calls) {
    const v = c.case_health_score;
    if (v === null || v === undefined) continue;
    if (v < CHS_PASS) out["0-70"] += 1;
    else if (v < CHS_HEALTHY) out["70-85"] += 1;
    else out["85-100"] += 1;
  }
  return out;
}

export function RatingDistribution({
  calls,
  emptyMessage,
}: {
  calls: CallRecord[];
  emptyMessage?: string;
}) {
  const counts = bucketize(calls);
  const total = ORDER.reduce((acc, k) => acc + counts[k], 0);
  const max = Math.max(...ORDER.map((k) => counts[k]));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Rating distribution
        </div>

        {!total ? (
          <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
            {emptyMessage ?? "No rating data"}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {ORDER.map((k) => {
                const n = counts[k];
                const pct = (n / total) * 100;
                const barPct = max > 0 ? (n / max) * 100 : 0;
                return (
                  <div key={k} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="text-2xl font-semibold tabular-nums leading-none"
                        style={{ color: COLORS[k] }}
                      >
                        {pct.toFixed(1)}%
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
                        {LABELS[k]} · {n}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-sm bg-muted">
                      <div
                        className="h-full rounded-sm transition-[width]"
                        style={{
                          width: `${barPct}%`,
                          background: COLORS[k],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 border-t border-border pt-2 text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
              Total · {total} calls
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
