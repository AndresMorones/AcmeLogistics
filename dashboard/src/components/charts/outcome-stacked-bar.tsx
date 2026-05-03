import {
  OUTCOME_ALIASES,
  OUTCOME_COLORS,
  OUTCOME_LABELS,
  OUTCOME_ORDER,
  type OutcomeKey,
} from "@/lib/outcome-palette";

export function OutcomeStackedBar({
  byOutcome,
  emptyMessage,
}: {
  byOutcome: Record<string, number>;
  emptyMessage?: string;
}) {
  const merged: Record<OutcomeKey, number> = {
    load_booked: 0,
    no_match: 0,
    carrier_not_qualified: 0,
    call_abandoned: 0,
  };
  // Twin emits canonical keys ("load_booked") AND colloquial aliases ("booked",
  // "fmcsa_declined", "not_qualified"); merging via OUTCOME_ALIASES prevents half
  // the rows from silently dropping out of the bar.
  for (const [k, v] of Object.entries(byOutcome)) {
    const canonical = (OUTCOME_ORDER as readonly string[]).includes(k)
      ? (k as OutcomeKey)
      : OUTCOME_ALIASES[k];
    if (canonical) merged[canonical] += v ?? 0;
  }
  const counts = OUTCOME_ORDER.map((k) => ({ key: k, n: merged[k] }));
  const total = counts.reduce((acc, d) => acc + d.n, 0);

  if (!total) {
    return (
      <div className="flex h-16 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        {emptyMessage ?? "No calls in the selected window."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex h-16 overflow-hidden rounded-md border border-border">
        {counts.map((d) => {
          if (d.n === 0) return null;
          const pct = (d.n / total) * 100;
          const pctRounded = Math.round(pct);
          // Booked is the headline outcome — looser visibility cutoffs keep its
          // % and label readable on slim slices; other outcomes suppress to avoid clutter.
          const isBooked = d.key === "load_booked";
          const showPct = isBooked ? pct >= 8 : pct >= 12;
          const showLabel = isBooked ? pct >= 6 : pct >= 18;
          return (
            <div
              key={d.key}
              className="flex flex-col items-center justify-center text-white"
              style={{ flex: pct, background: OUTCOME_COLORS[d.key] }}
              title={`${OUTCOME_LABELS[d.key]}: ${d.n} (${pct.toFixed(1)}%)`}
            >
              {showPct ? (
                <span
                  className={
                    isBooked
                      ? "text-xl font-bold tabular-nums leading-none"
                      : "text-sm font-semibold tabular-nums leading-none"
                  }
                >
                  {pctRounded}%
                </span>
              ) : null}
              {showLabel ? (
                <span
                  className={
                    isBooked
                      ? "mt-1 text-[11px] font-semibold uppercase tracking-wider"
                      : "mt-1 text-[9px] uppercase tracking-wider opacity-90"
                  }
                >
                  {OUTCOME_LABELS[d.key]}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {counts.map((d) => (
          <span key={d.key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: OUTCOME_COLORS[d.key] }}
            />
            {OUTCOME_LABELS[d.key]} · <span className="tabular-nums">{d.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
