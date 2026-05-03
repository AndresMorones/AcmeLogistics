"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TrendLineProps = {
  data: { x: string; y: number | null }[];
  yLabel?: string;
  yDomain?: [number, number];
  isPercent?: boolean;
  emptyMessage?: string;
};

export function TrendLine({
  data,
  yLabel,
  yDomain,
  isPercent,
  emptyMessage,
}: TrendLineProps) {
  const valid = data.filter((d) => d.y !== null);
  if (!valid.length) {
    return (
      <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        {emptyMessage ?? "Not enough data for a trend yet."}
      </div>
    );
  }
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
        >
          <CartesianGrid stroke="hsl(214 32% 91%)" strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            stroke="hsl(215 16% 47%)"
            fontSize={11}
            tickMargin={6}
          />
          <YAxis
            stroke="hsl(215 16% 47%)"
            fontSize={11}
            domain={yDomain ?? ["auto", "auto"]}
            label={
              yLabel
                ? {
                    value: yLabel,
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 11,
                    fill: "hsl(215 16% 47%)",
                  }
                : undefined
            }
          />
          {/* Theme tokens (not literal HSL) so the tooltip stays legible in dark mode. */}
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              color: "hsl(var(--popover-foreground))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(raw) => {
              const v = typeof raw === "number" ? raw : null;
              return v === null
                ? ["—", yLabel ?? "Value"]
                : [
                    isPercent ? `${v.toFixed(1)}%` : v.toString(),
                    yLabel ?? "Value",
                  ];
            }}
          />
          <Line
            type="monotone"
            dataKey="y"
            stroke="hsl(217 91% 60%)"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
