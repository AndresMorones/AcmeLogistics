"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtNumber } from "@/lib/format";
import type { CallRecord, TelemetryAggregate } from "@/types/api-types";

const SPARK_COLOR = "#FFB800";

type Props = {
  telemetry: TelemetryAggregate;
  calls: CallRecord[];
  bookingsCount: number;
};

function sumNullable(values: Array<number | null | undefined>): number {
  let t = 0;
  for (const v of values) if (typeof v === "number") t += v;
  return t;
}

function conversationTotal(
  tpm: TelemetryAggregate["tpm_series"],
  bucketMinutes: number,
): number {
  let total = 0;
  for (const p of tpm) total += p.tpm * bucketMinutes;
  return Math.round(total);
}

export function CostPerBookingCard({ telemetry, calls, bookingsCount }: Props) {
  // Numerator = conversation tokens (TPM-series integrated over bucket width) + post-call
  // Extract+CHS, which run after hangup and are billed separately. Denominator is the same
  // bookings count the headline KPI shows, so per-booking math reconciles with that card.
  const bucketMin = telemetry.window.bucket_minutes || 1;
  const conversation = conversationTotal(telemetry.tpm_series, bucketMin);
  const postCall =
    sumNullable(calls.map((c) => c.extract_input_tokens)) +
    sumNullable(calls.map((c) => c.extract_output_tokens)) +
    sumNullable(calls.map((c) => c.chs_input_tokens)) +
    sumNullable(calls.map((c) => c.chs_output_tokens));

  const totalTokens = conversation + postCall;
  const tokensPerBooking = bookingsCount > 0 ? totalTokens / bookingsCount : null;

  const sparkData = telemetry.tpm_series.map((p) => ({
    t: p.t,
    v: p.tpm,
  }));
  const hasSpark = sparkData.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-mono text-xs uppercase tracking-wider text-primary">
          Tokens per booking
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Total window tokens (conversation + post-call) ÷ bookings.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="font-mono text-2xl tabular-nums text-foreground">
              {tokensPerBooking !== null ? fmtNumber(Math.round(tokensPerBooking)) : "—"}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              tokens / booking
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[11px] tabular-nums">
              {fmtNumber(totalTokens)}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              tokens · {fmtNumber(bookingsCount)} booking{bookingsCount === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        {hasSpark ? (
          <div className="h-[56px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={sparkData}
                margin={{ top: 2, right: 0, bottom: 2, left: 0 }}
              >
                <defs>
                  <linearGradient id="cost-per-booking-spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SPARK_COLOR} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={SPARK_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: "var(--font-mono, ui-monospace)",
                  }}
                  labelFormatter={() => ""}
                  formatter={(v) => [
                    fmtNumber(typeof v === "number" ? v : 0),
                    "tpm",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={SPARK_COLOR}
                  strokeWidth={1.25}
                  fill="url(#cost-per-booking-spark)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[56px] items-center justify-center border border-dashed border-border text-[11px] text-muted-foreground">
            No token activity in window.
          </div>
        )}
        <div className="text-[10.5px] text-muted-foreground">
          conversation {fmtNumber(conversation)} · post-call (Extract + CHS){" "}
          {fmtNumber(postCall)}
        </div>
      </CardContent>
    </Card>
  );
}
