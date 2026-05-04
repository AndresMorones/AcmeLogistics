import { Card } from "@/components/ui/card";
import { fmtCurrency, signedTone, signedToneClass } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EconomicsMetrics } from "@/types/api-types";

export function RateSummaryCard({ economics }: { economics: EconomicsMetrics }) {
  const deltaPerLoad = economics.effective_delta_dollars;
  const pct = economics.effective_delta_pct;
  const totalDelta =
    deltaPerLoad !== null
      ? deltaPerLoad * economics.total_calls_with_rate
      : null;

  const showDelta = pct !== null && totalDelta !== null;
  // Sign convention: delta = listed - agreed (computed server-side). Positive =
  // booked under listed (margin captured, green); negative = booked above listed
  // (premium paid, red). signedTone maps the signed total to the colour ladder;
  // mirrored in reactive-widget — keep in sync.
  const tone = signedToneClass(showDelta ? signedTone(totalDelta) : "neutral");

  return (
    <Card className="px-3 py-2 leading-tight">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Rate (avg) · Booked
      </p>
      <p className="text-lg font-semibold tabular-nums tracking-tight">
        {fmtCurrency(economics.avg_agreed_rate)}
      </p>
      {showDelta ? (
        <p className={cn("text-[10px] tabular-nums", tone)}>
          {pct > 0 ? "+" : ""}
          {pct.toFixed(1)}% vs listed · {totalDelta > 0 ? "+" : ""}
          {fmtCurrency(totalDelta)}
        </p>
      ) : null}
    </Card>
  );
}
