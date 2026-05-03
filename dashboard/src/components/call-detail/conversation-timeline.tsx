import { Clock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDuration, fmtMs, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { JsonDump } from "./tool-sequence";

function fmtSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return "—";
  }
  return `${Math.max(0, Math.round(seconds))}s`;
}
import type {
  CallTimelineEntry,
  CallTimelineEntryKind,
  CallTimelineResponse,
} from "@/types/api-types";

// Four turn kinds form the wire contract: every entry must carry one or the
// row renderer falls through to the empty-turn placeholder branch.
const KIND_DOT_CLASS: Record<CallTimelineEntryKind, string> = {
  assistant_message: "bg-sky-500",
  user_message: "bg-slate-500",
  assistant_tool_call: "bg-amber-500",
  tool_result: "bg-emerald-600",
};

const KIND_LABEL: Record<CallTimelineEntryKind, string> = {
  assistant_message: "Agent",
  user_message: "Carrier",
  assistant_tool_call: "Tool call",
  tool_result: "Tool result",
};

function relOffsetSeconds(timestamp: string, startedAt: string | null): number | null {
  if (!startedAt) return null;
  const t = new Date(timestamp).getTime();
  const s = new Date(startedAt).getTime();
  if (Number.isNaN(t) || Number.isNaN(s)) return null;
  return (t - s) / 1000;
}

function fmtOffset(seconds: number | null): string {
  if (seconds === null) return "—";
  const sign = seconds < 0 ? "-" : "+";
  const abs = Math.abs(seconds);
  if (abs < 60) return `${sign}${abs.toFixed(1)}s`;
  const m = Math.floor(abs / 60);
  const s = abs - m * 60;
  return `${sign}${m}m${s.toFixed(0).padStart(2, "0")}s`;
}

function renderToolCallSignature(
  toolName: string,
  args: Record<string, unknown> | null | undefined,
): string {
  if (!args || Object.keys(args).length === 0) return `${toolName}()`;
  const parts = Object.entries(args).map(([k, v]) => {
    let s: string;
    if (v === null || v === undefined) s = "null";
    else if (typeof v === "string") s = JSON.stringify(v);
    else if (typeof v === "number" || typeof v === "boolean") s = String(v);
    else s = JSON.stringify(v);
    if (s.length > 32) s = `${s.slice(0, 29)}…`;
    return `${k}=${s}`;
  });
  return `${toolName}(${parts.join(", ")})`;
}

function summarizeResult(result: Record<string, unknown> | null | undefined): string {
  if (!result || Object.keys(result).length === 0) return "(empty)";
  const flat = JSON.stringify(result);
  return flat.length > 80 ? `${flat.slice(0, 77)}…` : flat;
}

function TimelineRow({
  entry,
  startedAt,
}: {
  entry: CallTimelineEntry;
  startedAt: string | null;
}) {
  const offset = relOffsetSeconds(entry.timestamp, startedAt);
  const isToolCall = entry.kind === "assistant_tool_call";
  const isToolResult = entry.kind === "tool_result";
  const toolName = entry.tool_name ?? "tool";

  let headline: string;
  if (isToolCall) {
    headline = renderToolCallSignature(toolName, entry.args);
  } else if (isToolResult) {
    headline = summarizeResult(entry.result);
  } else {
    headline = entry.content?.trim() || "(empty turn)";
  }

  // 200-char threshold keeps short messages flat; longer prose gets a details/summary
  // disclosure so the timeline does not blow vertical for a single chatty turn.
  const expandable =
    (isToolCall && entry.args && Object.keys(entry.args).length > 0) ||
    (isToolResult && entry.result && Object.keys(entry.result).length > 0) ||
    ((entry.kind === "assistant_message" || entry.kind === "user_message") &&
      (entry.content?.length ?? 0) > 200);

  const jsonValue: Record<string, unknown> | null =
    isToolCall && entry.args
      ? entry.args
      : isToolResult && entry.result
        ? entry.result
        : null;

  return (
    <div className="grid grid-cols-[64px_16px_1fr] gap-2 py-1.5">
      <div className="pt-0.5 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {fmtOffset(offset)}
      </div>
      <div className="relative flex justify-center">
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
        <div
          className={cn(
            "relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-background",
            KIND_DOT_CLASS[entry.kind],
          )}
        />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <span className="font-medium">{KIND_LABEL[entry.kind]}</span>
          {(isToolCall || isToolResult) && entry.tool_name ? (
            <span className="font-mono normal-case tracking-normal text-foreground/80">
              · {entry.tool_name}
            </span>
          ) : null}
          {isToolResult && entry.duration_ms !== null && entry.duration_ms !== undefined ? (
            <span className="rounded-sm border bg-muted/40 px-1 py-0.5 font-mono normal-case tracking-normal tabular-nums text-foreground">
              {fmtMs(entry.duration_ms)}
            </span>
          ) : null}
        </div>
        {expandable ? (
          <details className="group mt-0.5">
            <summary className="cursor-pointer list-none text-sm leading-snug text-foreground line-clamp-2 group-open:line-clamp-none">
              {headline}
            </summary>
            {jsonValue ? (
              <div className="mt-1">
                <JsonDump value={jsonValue} />
              </div>
            ) : (entry.kind === "assistant_message" || entry.kind === "user_message") &&
              entry.content ? (
              <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-foreground">
                {entry.content}
              </p>
            ) : null}
          </details>
        ) : (
          <p className="mt-0.5 text-sm leading-snug text-foreground line-clamp-2">
            {headline}
          </p>
        )}
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-2.5 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function ConversationTimeline({
  data,
}: {
  data: CallTimelineResponse | null;
}) {
  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Conversation timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            Transcript not available for this call.
          </div>
        </CardContent>
      </Card>
    );
  }

  const { timeline, summary } = data;
  const startedAt = summary.started_at;

  const subline = [
    `${fmtNumber(summary.turn_count)} turns`,
    summary.duration_seconds !== null
      ? fmtDuration(summary.duration_seconds)
      : null,
    `${fmtNumber(summary.tool_call_count)} tool calls`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Conversation timeline
          <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">
            {subline}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {timeline.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            No turns recorded for this call.
          </div>
        ) : (
          <div className="rounded-md border bg-card">
            <div className="divide-y">
              {timeline.map((entry, i) => (
                <TimelineRow
                  key={`${entry.kind}-${entry.timestamp}-${i}`}
                  entry={entry}
                  startedAt={startedAt}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <StatPill
            label="Agent turns"
            value={fmtNumber(summary.assistant_turn_count)}
          />
          <StatPill
            label="Carrier turns"
            value={fmtNumber(summary.user_turn_count)}
          />
          <StatPill
            label="Tool calls"
            value={fmtNumber(summary.tool_call_count)}
          />
          <StatPill
            label="First reply"
            value={fmtMs(summary.time_to_first_assistant_response_ms)}
          />
          <StatPill
            label="Duration"
            value={fmtSeconds(summary.duration_seconds)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
