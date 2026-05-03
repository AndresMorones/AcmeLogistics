"use client";

import * as React from "react";
import { Info } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fmtMs, fmtNumber } from "@/lib/format";
import type {
  TelemetryLatency,
  TelemetryLatencyPoint,
  TelemetryToolLatency,
} from "@/types/api-types";

const COLORS = {
  p50: "#22D3EE",
  p70: "#34D399",
  p90: "#F4A24C",
  p99: "#F87171",
};

const ALL_TOOLS = "__all__";

function fmtTime(t: string): string {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtTooltip(value: unknown): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return fmtMs(value);
}

type Headline = {
  p50_ms: number | null;
  p70_ms: number | null;
  p90_ms: number | null;
  p99_ms: number | null;
};

const HEADLINE_KEYS: Array<{ key: keyof Headline; label: string; color: string }> = [
  { key: "p50_ms", label: "p50", color: COLORS.p50 },
  { key: "p70_ms", label: "p70", color: COLORS.p70 },
  { key: "p90_ms", label: "p90", color: COLORS.p90 },
  { key: "p99_ms", label: "p99", color: COLORS.p99 },
];

function HeadlineStat({
  label,
  color,
  value,
}: {
  label: string;
  color: string;
  value: number | null | undefined;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-2 w-2 rounded-sm"
        style={{ background: color }}
        aria-hidden
      />
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[12px] tabular-nums">
        {typeof value === "number" ? fmtMs(value) : "—"}
      </span>
    </div>
  );
}

export function LatencyPercentilesCard({
  latency,
  series,
  totalRuns,
  byTool,
}: {
  latency: TelemetryLatency;
  series: TelemetryLatencyPoint[];
  totalRuns: number;
  byTool?: Record<string, TelemetryToolLatency>;
}) {
  // Percentiles derived from the gap between an agent tool-call turn and its NEXT spoken
  // turn (UUIDv7 timestamps decoded from turn IDs) — tool turns carry no timestamp of their
  // own, so this gap is the only proxy for tool-exec + model-followup latency.
  const toolNames = React.useMemo(
    () => (byTool ? Object.keys(byTool).sort() : []),
    [byTool],
  );
  const [tool, setTool] = React.useState<string>(ALL_TOOLS);

  // If the previously-selected tool drops out of a new range payload, fall back to "All
  // tools" — otherwise the chart would render empty with no signal as to why.
  React.useEffect(() => {
    if (tool !== ALL_TOOLS && !toolNames.includes(tool)) {
      setTool(ALL_TOOLS);
    }
  }, [tool, toolNames]);

  const filtered = tool !== ALL_TOOLS && byTool ? byTool[tool] : null;
  const activeHeadline: Headline = filtered
    ? {
        p50_ms: filtered.p50_ms,
        p70_ms: filtered.p70_ms,
        p90_ms: filtered.p90_ms,
        p99_ms: filtered.p99_ms,
      }
    : {
        p50_ms: latency.p50_ms,
        p70_ms: latency.p70_ms,
        p90_ms: latency.p90_ms,
        p99_ms: latency.p99_ms,
      };
  const activeSeries = filtered ? filtered.series : series;
  const activeSampleLabel = filtered
    ? `${fmtNumber(filtered.sample_count)} ${tool} call${filtered.sample_count === 1 ? "" : "s"}`
    : `${fmtNumber(latency.sample_count)} tool calls · ${fmtNumber(totalRuns)} runs`;

  const empty = activeSeries.length === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider">
          Latency percentiles
          <UITooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="How is this calculated"
                className="inline-flex text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                <Info className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm text-[11px] leading-relaxed">
              <strong>How this is calculated.</strong> For every tool call in
              every conversation, we measure the gap from the agent&apos;s
              tool-call turn to the agent&apos;s NEXT spoken turn (UUIDv7
              timestamps decoded from turn IDs). Tool turns themselves carry
              no timestamp, so this gap captures tool execution + the
              model&apos;s follow-up generation. Per-bucket pXX = the
              linear-interpolated percentile across all gaps in that bucket.
              Window headline = same percentile across all gaps in the
              window. Use the tool filter to scope to one tool.
            </TooltipContent>
          </UITooltip>
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Per-bucket p50 / p70 / p90 / p99 across tool-call roundtrips.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b pb-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Total runs <span className="ml-1 text-foreground">{fmtNumber(totalRuns)}</span>
          </span>
          {HEADLINE_KEYS.map((h) => (
            <HeadlineStat
              key={h.key}
              label={h.label}
              color={h.color}
              value={activeHeadline[h.key]}
            />
          ))}
          {toolNames.length > 0 ? (
            <div className="ml-auto flex items-center gap-2">
              <label
                htmlFor="latency-tool-filter"
                className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                Tool
              </label>
              <Select value={tool} onValueChange={setTool}>
                <SelectTrigger
                  id="latency-tool-filter"
                  className="h-7 w-[10rem] px-2 font-mono text-xs tabular-nums"
                >
                  <SelectValue placeholder="All tools" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TOOLS}>All tools</SelectItem>
                  {toolNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
        <div className="text-[10.5px] text-muted-foreground">
          {activeSampleLabel}
        </div>
        {empty ? (
          <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            No tool-call samples in window.
          </div>
        ) : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={activeSeries}
                margin={{ top: 8, right: 12, bottom: 0, left: 8 }}
              >
                <CartesianGrid
                  stroke="hsl(var(--border))"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="t"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickFormatter={fmtTime}
                  tickMargin={4}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickFormatter={(v: number) => fmtMs(v)}
                  width={56}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: "var(--font-mono, ui-monospace)",
                  }}
                  labelFormatter={(t: string) => fmtTime(t)}
                  formatter={(value, name) => [fmtTooltip(value), String(name)]}
                />
                <Line
                  type="monotone"
                  dataKey="p50_ms"
                  name="p50"
                  stroke={COLORS.p50}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="p70_ms"
                  name="p70"
                  stroke={COLORS.p70}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="p90_ms"
                  name="p90"
                  stroke={COLORS.p90}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="p99_ms"
                  name="p99"
                  stroke={COLORS.p99}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
