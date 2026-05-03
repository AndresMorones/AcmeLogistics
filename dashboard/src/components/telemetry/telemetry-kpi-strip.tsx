import { Card } from "@/components/ui/card";
import { fmtMs, fmtNumber } from "@/lib/format";
import type { TelemetryAggregate } from "@/types/api-types";

type StatProps = {
  label: string;
  value: string;
};

function Stat({ label, value }: StatProps) {
  return (
    <div className="flex flex-1 flex-col gap-0.5 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// Transcript-derived latency can legitimately be null (e.g. single-turn calls
// have no inter-turn gap to measure); render an em-dash instead of "0 ms" so
// the strip doesn't fabricate a misleading datapoint.
function fmtLatency(
  value: number | null,
  source: TelemetryAggregate["latency"]["source"],
): string {
  if ((source === "transcript_count" || source === "transcript") && value === null) {
    return "—";
  }
  return fmtMs(value);
}

export function TelemetryKpiStrip({ data }: { data: TelemetryAggregate }) {
  const { latency, totals } = data;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Telemetry · aggregate
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total runs" value={fmtNumber(totals.runs)} />
        <Stat
          label="p50"
          value={fmtLatency(latency.p50_ms, latency.source)}
        />
        <Stat
          label="p70"
          value={fmtLatency(latency.p70_ms, latency.source)}
        />
        <Stat
          label="p90"
          value={fmtLatency(latency.p90_ms, latency.source)}
        />
        <Stat
          label="p99"
          value={fmtLatency(latency.p99_ms, latency.source)}
        />
      </div>
    </Card>
  );
}
