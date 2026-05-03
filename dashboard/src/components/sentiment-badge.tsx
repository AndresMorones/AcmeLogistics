import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/format";

export function SentimentBadge({
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
  const v = value.toLowerCase();
  const variant =
    v === "positive" ? "success" : v === "negative" ? "destructive" : "info";
  return (
    <Badge variant={variant} className={cn("font-medium", className)}>
      {titleCase(value)}
    </Badge>
  );
}
