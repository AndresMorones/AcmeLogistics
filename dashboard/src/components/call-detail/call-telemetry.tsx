import { Activity } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtNumber } from "@/lib/format";
import type { CallDetailRecord } from "@/lib/api-client";
import type { CallTimelineResponse } from "@/types/api-types";

function StatBlock({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function fmtRate(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function combine(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  const aMissing = a == null || Number.isNaN(a);
  const bMissing = b == null || Number.isNaN(b);
  if (aMissing && bMissing) return null;
  return (a ?? 0) + (b ?? 0);
}

// Token + rate stats are derived per-call from transcript turns; the upstream
// /runs telemetry endpoint was retired, so summary fields here come from
// server-side parsing of the stored transcript JSON, not a live provider API.
export function CallTelemetry({
  call,
  timeline,
}: {
  call: CallDetailRecord;
  timeline: CallTimelineResponse | null;
}) {
  const summary = timeline?.summary ?? null;

  const inputTokens = summary
    ? combine(summary.agent_input_tokens, summary.tool_input_tokens)
    : null;
  const outputTokens = summary
    ? combine(summary.agent_output_tokens, summary.tool_output_tokens)
    : null;

  const durationSeconds =
    summary?.duration_seconds ?? call.duration_seconds ?? null;
  const userTurnCount = summary?.user_turn_count ?? null;

  const minutes =
    durationSeconds && durationSeconds > 0 ? durationSeconds / 60 : null;

  const rpm =
    minutes !== null && userTurnCount !== null ? userTurnCount / minutes : null;

  const totalTokens =
    inputTokens !== null || outputTokens !== null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : null;
  const tpm = minutes !== null && totalTokens !== null ? totalTokens / minutes : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          Tokens &amp; rate
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBlock
            label="Input tokens"
            value={fmtNumber(inputTokens)}
            hint="Agent + tool prompts"
          />
          <StatBlock
            label="Output tokens"
            value={fmtNumber(outputTokens)}
            hint="Agent + tool completions"
          />
          <StatBlock
            label="RPM"
            value={fmtRate(rpm)}
            hint="Requests per minute"
          />
          <StatBlock
            label="TPM"
            value={fmtRate(tpm)}
            hint="Tokens per minute"
          />
        </div>
      </CardContent>
    </Card>
  );
}
