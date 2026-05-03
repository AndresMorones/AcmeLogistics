import { AlertTriangle, Loader2, Inbox } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export type TelemetryEmptyStateProps = {
  reason: "loading" | "no_runs" | "hr_unavailable";
};

const COPY: Record<
  TelemetryEmptyStateProps["reason"],
  { title: string; body: string; Icon: typeof AlertTriangle }
> = {
  loading: {
    title: "Loading telemetry…",
    body: "Fetching aggregate run metrics from HR.",
    Icon: Loader2,
  },
  no_runs: {
    title: "No runs in window",
    body: "No HR runs landed in the selected date range. Adjust the filter or wait for the next call.",
    Icon: Inbox,
  },
  // Names HAPPYROBOT_API_KEY rotation explicitly so on-call lands on the most common root
  // cause without digging through logs — the run-details upstream is the flakiest source here.
  hr_unavailable: {
    title: "HR run-details API unreachable",
    body: "Check HAPPYROBOT_API_KEY rotation. Aggregate metrics are unavailable but other tabs still work.",
    Icon: AlertTriangle,
  },
};

export function TelemetryEmptyState({ reason }: TelemetryEmptyStateProps) {
  const { title, body, Icon } = COPY[reason];
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Icon
          className={
            reason === "loading"
              ? "h-6 w-6 animate-spin text-muted-foreground"
              : "h-6 w-6 text-muted-foreground"
          }
          aria-hidden
        />
        <div className="text-sm font-medium">{title}</div>
        <p className="max-w-md text-xs text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
