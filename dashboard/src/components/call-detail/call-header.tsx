import { fmtDateTime, fmtRelative } from "@/lib/format";
import type { CallDetailRecord } from "@/lib/api-client";

function shortCallId(id: string | null | undefined): string {
  if (!id) return "—";
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function CallHeader({ call }: { call: CallDetailRecord }) {
  const callId = call.call_id ?? "";
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        Call detail
      </p>
      <h1
        className="text-2xl font-semibold tracking-tight"
        title={callId || undefined}
      >
        Call {shortCallId(callId)}
      </h1>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span title={call.created_at ?? undefined}>
          {fmtDateTime(call.created_at)}
        </span>
        {call.created_at ? (
          <>
            <span aria-hidden>·</span>
            <span>{fmtRelative(call.created_at)}</span>
          </>
        ) : null}
        {call.callback_phone ? (
          <>
            <span aria-hidden>·</span>
            <span className="font-mono">☎ {call.callback_phone}</span>
          </>
        ) : null}
        {call.mc_number ? (
          <>
            <span aria-hidden>·</span>
            <span className="font-mono">MC {call.mc_number}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

export { shortCallId };
