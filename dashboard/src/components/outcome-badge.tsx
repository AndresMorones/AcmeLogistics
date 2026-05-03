import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/format";

export function OutcomeBadge({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  if (!value) {
    return (
      <Badge variant="outline" className={cn("font-normal", className)}>
        —
      </Badge>
    );
  }
  // Source-of-truth for outcome→tint contract: only meaningful outcomes are colored
  // (win=green, reject=red, drop=amber); no_match and unknowns stay plain so the rest pop.
  const v = value.toLowerCase();
  const variant =
    v === "load_booked"
      ? "success"
      : v === "carrier_not_qualified"
        ? "destructive"
        : v === "call_abandoned"
          ? "warning"
          : "outline";
  return (
    <Badge variant={variant} className={cn("font-medium", className)}>
      {titleCase(value)}
    </Badge>
  );
}
