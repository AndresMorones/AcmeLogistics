import type { CallRecord } from "@/types/api-types";
import { Card, CardContent } from "@/components/ui/card";
import { CHS_PASS, isFlagged } from "@/lib/chs-thresholds";

export function FlaggedHeadline({ calls }: { calls: CallRecord[] }) {
  const flaggedCount = calls.reduce(
    (acc, c) => (isFlagged(c.case_health_score) ? acc + 1 : acc),
    0,
  );

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          flagged
        </p>
        <p className="mt-1 text-5xl font-bold tabular-nums tracking-tight">
          {flaggedCount}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          CHS &lt; {CHS_PASS}
        </p>
      </CardContent>
    </Card>
  );
}
