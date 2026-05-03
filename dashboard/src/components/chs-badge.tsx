import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CHS_HEALTHY, CHS_PASS } from "@/lib/chs-thresholds";

export function ChsBadge({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  if (value === null || value === undefined) {
    return (
      <Badge variant="outline" className={cn("font-normal", className)}>
        —
      </Badge>
    );
  }
  // Tier cutoffs sourced from chs-thresholds — single source of truth shared
  // with agent gating logic, so badge color and pass/fail decision can never drift.
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const variant =
    v >= CHS_HEALTHY ? "success" : v >= CHS_PASS ? "info" : "destructive";
  return (
    <Badge variant={variant} className={cn("font-medium tabular-nums", className)}>
      {v}
    </Badge>
  );
}
