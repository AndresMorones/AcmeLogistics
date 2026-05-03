"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import {
  favorableSentimentPct,
  type DailySentimentBucket,
} from "@/lib/daily-buckets";

const COLORS = {
  positive: "hsl(142 71% 45%)",
  neutral: "hsl(217 91% 60%)",
  negative: "hsl(0 72% 51%)",
};

function fmtAxisDate(d: string): string {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SentimentOverTime({
  buckets,
  height = 220,
}: {
  buckets: DailySentimentBucket[];
  height?: number;
}) {
  const favorable = favorableSentimentPct(buckets);
  const hasData = buckets.some((b) => b.total > 0);

  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Favorable sentiment
        </p>
        <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
          {favorable === null ? "—" : `${favorable}%`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          (positive + neutral) / total
        </p>
        <div className="mt-4">
          {!hasData ? (
            <div
              className="flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
              style={{ height }}
            >
              No sentiment data in the selected window.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={height}>
              <BarChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis
                  dataKey="d"
                  tickFormatter={fmtAxisDate}
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                  strokeOpacity={0.4}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                  strokeOpacity={0.4}
                  width={36}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                <Bar dataKey="positive" stackId="s" fill={COLORS.positive} name="Positive" />
                <Bar dataKey="neutral" stackId="s" fill={COLORS.neutral} name="Neutral" />
                <Bar dataKey="negative" stackId="s" fill={COLORS.negative} name="Negative" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
