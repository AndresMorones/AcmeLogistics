import { ChsBadge } from "@/components/chs-badge";
import { OutcomeBadge } from "@/components/outcome-badge";
import { SentimentBadge } from "@/components/sentiment-badge";
import { Card } from "@/components/ui/card";
import { fmtDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CHS_HEALTHY, CHS_PASS } from "@/lib/chs-thresholds";
import type { CallDetailRecord } from "@/lib/api-client";

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

export function CallKpiCards({ call }: { call: CallDetailRecord }) {
  const outcome = call.call_outcome ?? null;
  const fmcsaFailure = call.fmcsa_eligibility_failure_reason ?? null;
  const chs = call.case_health_score;

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3",
        fmcsaFailure ? "lg:grid-cols-6" : "lg:grid-cols-5",
      )}
    >
      <Card className="p-4">
        <CardLabel>Duration</CardLabel>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
          {fmtDuration(call.duration_seconds)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          End-to-end call length
        </p>
      </Card>

      <Card className="p-4">
        <CardLabel>Case health</CardLabel>
        <div className="mt-1 flex items-baseline gap-2">
          {/* Tier cutoffs imported from chs-thresholds so badge, KPI, and list
              filters all flip color at the same score. */}
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums tracking-tight",
              chs === null || chs === undefined
                ? "text-muted-foreground"
                : chs >= CHS_HEALTHY
                  ? "text-success"
                  : chs >= CHS_PASS
                    ? "text-foreground"
                    : "text-destructive",
            )}
          >
            {chs ?? "—"}
          </p>
          <ChsBadge value={chs} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {chs === null || chs === undefined
            ? "Not scored"
            : chs >= CHS_HEALTHY
              ? "Excellent"
              : chs >= CHS_PASS
                ? "Pass"
                : "Below threshold"}
        </p>
      </Card>

      <Card className="p-4">
        <CardLabel>Sentiment</CardLabel>
        <div className="mt-2">
          <SentimentBadge value={call.sentiment} className="text-sm" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Carrier emotional read
        </p>
      </Card>

      <Card className="p-4">
        <CardLabel>Outcome</CardLabel>
        <div className="mt-2">
          <OutcomeBadge value={outcome} className="text-sm" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Final classifier tag
        </p>
      </Card>

      <Card className="p-4">
        <CardLabel>MC number</CardLabel>
        <p
          className={
            call.mc_number
              ? "mt-1 text-2xl font-mono font-semibold tabular-nums tracking-tight text-foreground"
              : "mt-1 text-2xl font-mono font-semibold tabular-nums tracking-tight text-muted-foreground"
          }
        >
          {call.mc_number ?? "—"}
        </p>
      </Card>

      {fmcsaFailure ? (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <CardLabel>FMCSA decline</CardLabel>
          <p className="mt-1 line-clamp-2 text-sm font-medium text-destructive">
            {fmcsaFailure}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Carrier failed eligibility
          </p>
        </Card>
      ) : null}
    </div>
  );
}
