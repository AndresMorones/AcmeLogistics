"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  deltaPct?: number | null;
  sparkline?: Array<{ d: string; v: number }>;
  sparkColor?: "amber" | "blue" | "emerald" | "rose" | "sky" | "violet";
  invert?: boolean;
  deltaInverted?: boolean;
  trend?: 1 | 0 | -1;
  trendLabel?: string;
  className?: string;
};

const SPARK_COLOR_INDEX: Record<NonNullable<KpiCardProps["sparkColor"]>, number> =
  {
    amber: 1,
    sky: 2,
    blue: 2,
    emerald: 3,
    rose: 4,
    violet: 5,
  };

export function KpiCard({
  label,
  value,
  hint,
  deltaPct,
  deltaInverted,
  sparkline,
  sparkColor = "amber",
  invert = false,
  trend,
  trendLabel,
  className,
}: KpiCardProps) {
  const inverted = deltaInverted ?? invert;
  const showDelta = deltaPct !== undefined && deltaPct !== null;
  // Sparkline is opt-in: callers omit it on dense KPI strips where the area chart would crowd neighbors.
  const showSpark = sparkline && sparkline.length > 0;
  const showLegacyTrend = !showDelta && trend !== undefined;
  const gradientId = React.useId();

  return (
    <Card className={cn("px-3 py-2 leading-tight", className)}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-lg font-semibold tabular-nums tracking-tight">
          {value}
        </p>
        {showDelta && (
          <DeltaPill pct={deltaPct as number} inverted={inverted} />
        )}
        {showLegacyTrend && (
          <LegacyTrendChip trend={trend} label={trendLabel} invert={inverted} />
        )}
      </div>
      {showSpark && (
        <SparkLine
          data={sparkline}
          colorIdx={SPARK_COLOR_INDEX[sparkColor] ?? 1}
          gradientId={gradientId}
        />
      )}
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function fmtPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function DeltaPill({ pct, inverted }: { pct: number; inverted: boolean }) {
  // +/-5% deadband suppresses noise on small-sample KPIs; `inverted` flips good/bad coloring for metrics where down is desirable (e.g., latency, error rate).
  const direction = pct > 5 ? "up" : pct < -5 ? "down" : "flat";
  const Icon =
    direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  let tone: "good" | "bad" | "flat";
  if (direction === "flat") {
    tone = "flat";
  } else {
    const good = inverted ? direction === "down" : direction === "up";
    tone = good ? "good" : "bad";
  }
  const toneClass =
    tone === "good"
      ? "bg-success/15 text-success"
      : tone === "bad"
        ? "bg-destructive/15 text-destructive"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        toneClass,
      )}
    >
      <Icon className="h-3 w-3" />
      {fmtPct(pct)}
    </span>
  );
}

function SparkLine({
  data,
  colorIdx,
  gradientId,
}: {
  data: Array<{ d: string; v: number }>;
  colorIdx: number;
  gradientId: string;
}) {
  const stroke = `hsl(var(--chart-${colorIdx}))`;
  return (
    <div className="mt-2 h-8 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.4} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function LegacyTrendChip({
  trend,
  label,
  invert,
}: {
  trend: 1 | 0 | -1 | undefined;
  label?: string;
  invert: boolean;
}) {
  const arrow =
    trend === 1 ? (
      <ArrowUpRight className="h-4 w-4" />
    ) : trend === -1 ? (
      <ArrowDownRight className="h-4 w-4" />
    ) : (
      <Minus className="h-4 w-4" />
    );
  const goodTrend = invert ? -1 : 1;
  const badTrend = invert ? 1 : -1;
  const trendColor =
    trend === goodTrend
      ? "text-emerald-600"
      : trend === badTrend
        ? "text-red-600"
        : "text-muted-foreground";
  return (
    <div
      className={cn("flex items-center gap-1 text-xs font-medium", trendColor)}
    >
      {arrow}
      {label && <span>{label}</span>}
    </div>
  );
}
