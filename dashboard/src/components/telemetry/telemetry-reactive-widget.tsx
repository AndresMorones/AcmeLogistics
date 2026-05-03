import { Card, CardContent } from "@/components/ui/card";
import { fmtNumber } from "@/lib/format";
import {
  RPM_CEILING,
  RPM_WARNING,
  TPM_CEILING,
  TPM_WARNING,
} from "@/lib/telemetry-thresholds";
import { cn } from "@/lib/utils";
import type {
  CallRecord,
  TelemetryAggregate,
} from "@/types/api-types";

// 3-sigma anomaly rule with absolute floor: suppresses statistically-anomalous-
// but-fast outliers (e.g. p90=120ms, mean=80ms, stddev=10ms is 4σ but harmless).
// Floor tuned to demo-data UUIDv7 spacing (~10-20s gaps); production prompt-
// derived gaps closer to 1-3s would warrant lowering the floor.
const SIGMA_K = 3;
const SIGMA_MIN_SAMPLES = 8;
const SIGMA_P90_FLOOR_MS = 5000;

// Saturation pct is computed against WARNING (the early-signal band), not
// CEILING — alert sooner than the hard ceiling so ops has lead time before
// the model rate-limits. Thermometer still shows the CEILING as the visible upper bound.
const THRESHOLDS = {
  ERROR_RATE_AMBER_PCT: 5,
  ERROR_RATE_RED_PCT: 12,
  RPM_AMBER_PCT: 70,
  RPM_RED_PCT: 90,
  TPM_AMBER_PCT: 70,
  TPM_RED_PCT: 90,
};

type Severity = "red" | "amber" | "info";

type Alert = {
  severity: Severity;
  message: React.ReactNode;
  metric: string;
};

const SEV_DOT_CLASS: Record<Severity, string> = {
  red: "bg-destructive",
  amber: "bg-amber-500",
  info: "bg-sky-500",
};

const SEV_BORDER_CLASS: Record<Severity, string> = {
  red: "border-l-2 border-l-destructive",
  amber: "border-l-2 border-l-amber-500",
  info: "border-l-2 border-l-sky-500",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
      {children}
    </p>
  );
}

function buildAlerts(
  telemetry: TelemetryAggregate | null,
  calls: CallRecord[],
): Alert[] {
  const alerts: Alert[] = [];

  const byTool = telemetry?.latency_by_tool;
  if (byTool) {
    for (const [name, t] of Object.entries(byTool)) {
      if (
        t.p90_ms === null ||
        t.mean_ms === null ||
        t.stddev_ms === null ||
        // Skip stddev<=0: identical samples produce zero variance, dividing
        // (p90 - mean) by it yields Infinity sigma and a guaranteed false alert.
        t.stddev_ms <= 0 ||
        t.sample_count < SIGMA_MIN_SAMPLES ||
        t.p90_ms < SIGMA_P90_FLOOR_MS
      ) {
        continue;
      }
      const sigmas = (t.p90_ms - t.mean_ms) / t.stddev_ms;
      if (sigmas >= SIGMA_K) {
        alerts.push({
          severity: "red",
          metric: `sigma_${name}`,
          message: (
            <span>
              <b>{name}</b> p90 = {(t.p90_ms / 1000).toFixed(1)}s ·{" "}
              {sigmas.toFixed(1)}σ above mean
            </span>
          ),
        });
      }
    }
  }

  const errorPct = errorRatePct(calls);
  if (errorPct !== null) {
    if (errorPct >= THRESHOLDS.ERROR_RATE_RED_PCT) {
      alerts.push({
        severity: "red",
        metric: "error_rate",
        message: (
          <span>
            <b>{errorPct.toFixed(1)}% bad calls</b> (CHS &lt; 50)
          </span>
        ),
      });
    } else if (errorPct >= THRESHOLDS.ERROR_RATE_AMBER_PCT) {
      alerts.push({
        severity: "amber",
        metric: "error_rate",
        message: (
          <span>
            <b>{errorPct.toFixed(1)}% bad calls</b> elevated
          </span>
        ),
      });
    }
  }

  const peak = peakRates(telemetry);
  if (peak.rpmPct >= THRESHOLDS.RPM_RED_PCT) {
    alerts.push({
      severity: "red",
      metric: "rpm_saturation",
      message: <span><b>RPM {peak.rpmPct.toFixed(0)}%</b> of {RPM_WARNING}/min warn band</span>,
    });
  } else if (peak.rpmPct >= THRESHOLDS.RPM_AMBER_PCT) {
    alerts.push({
      severity: "amber",
      metric: "rpm_saturation",
      message: <span><b>RPM {peak.rpmPct.toFixed(0)}%</b> approaching warn band</span>,
    });
  }
  if (peak.tpmPct >= THRESHOLDS.TPM_RED_PCT) {
    alerts.push({
      severity: "red",
      metric: "tpm_saturation",
      message: <span><b>TPM {peak.tpmPct.toFixed(0)}%</b> of {fmtNumber(TPM_WARNING)}/min warn band</span>,
    });
  } else if (peak.tpmPct >= THRESHOLDS.TPM_AMBER_PCT) {
    alerts.push({
      severity: "amber",
      metric: "tpm_saturation",
      message: <span><b>TPM {peak.tpmPct.toFixed(0)}%</b> approaching warn band</span>,
    });
  }

  return alerts;
}

function ActiveAlertsCard({
  alerts,
}: {
  alerts: Alert[];
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Active alerts</SectionLabel>
          {alerts.length > 0 ? (
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              {alerts.length}
            </span>
          ) : (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
              ✓ clear
            </span>
          )}
        </div>
        {alerts.length === 0 ? (
          <p className="text-xs text-success">
            All systems within thresholds.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {alerts.map((a, i) => (
              <div
                key={`${a.metric}-${i}`}
                className={cn(
                  "flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs",
                  SEV_BORDER_CLASS[a.severity],
                )}
              >
                <span className={cn("h-2 w-2 rounded-full shrink-0", SEV_DOT_CLASS[a.severity])} />
                <span className="flex-1 leading-snug">{a.message}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const MAX_BUCKETS = 60;

function bucketBadCalls(
  calls: CallRecord[],
): { points: { ts: number; bad: number; total: number }[]; total: number; bad: number } {
  const valid = calls.filter((c) => c.created_at);
  if (valid.length === 0) {
    return { points: [], total: 0, bad: 0 };
  }
  const ts = valid
    .map((c) => new Date(c.created_at as string).getTime())
    .filter((t) => !Number.isNaN(t));
  if (ts.length === 0) return { points: [], total: 0, bad: 0 };

  const minTs = Math.min(...ts);
  const maxTs = Math.max(...ts);
  const span = Math.max(1, maxTs - minTs);
  const bucketCount = Math.min(MAX_BUCKETS, Math.max(12, Math.ceil(span / 60_000)));
  const bucketSize = span / bucketCount;
  const buckets: { ts: number; bad: number; total: number }[] = Array.from(
    { length: bucketCount },
    (_, i) => ({
      ts: minTs + i * bucketSize,
      bad: 0,
      total: 0,
    }),
  );

  for (const c of valid) {
    const t = new Date(c.created_at as string).getTime();
    if (Number.isNaN(t)) continue;
    const idx = Math.min(bucketCount - 1, Math.floor((t - minTs) / bucketSize));
    buckets[idx].total += 1;
    const chs = typeof c.case_health_score === "number" ? c.case_health_score : null;
    if (chs !== null && chs < 50) buckets[idx].bad += 1;
  }

  const total = buckets.reduce((a, b) => a + b.total, 0);
  const bad = buckets.reduce((a, b) => a + b.bad, 0);
  return { points: buckets, total, bad };
}

function errorRatePct(calls: CallRecord[]): number | null {
  const valid = calls.filter((c) => typeof c.case_health_score === "number");
  if (valid.length === 0) return null;
  const bad = valid.filter((c) => (c.case_health_score as number) < 50).length;
  return (bad / valid.length) * 100;
}

function ErrorRibbonCard({ calls }: { calls: CallRecord[] }) {
  const { points, total, bad } = bucketBadCalls(calls);
  const rate = total === 0 ? null : (bad / total) * 100;
  const overallTone =
    rate === null
      ? "muted"
      : rate >= THRESHOLDS.ERROR_RATE_RED_PCT
        ? "red"
        : rate >= THRESHOLDS.ERROR_RATE_AMBER_PCT
          ? "amber"
          : "green";

  const W = 300;
  const H = 60;
  const baseline = H - 8;
  const tickW = points.length > 0 ? W / points.length : 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Tool errors · this window</SectionLabel>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              overallTone === "red" && "bg-destructive/15 text-destructive",
              overallTone === "amber" && "bg-amber-500/15 text-amber-500",
              overallTone === "green" && "bg-success/15 text-success",
              overallTone === "muted" && "bg-muted text-muted-foreground",
            )}
          >
            {rate === null ? "—" : `${rate.toFixed(1)}%`}
          </span>
        </div>
        {points.length === 0 ? (
          <div className="flex h-[60px] items-center justify-center rounded-md border bg-muted/20 text-[11px] text-muted-foreground">
            No calls in this window.
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            preserveAspectRatio="none"
            className="rounded-md border bg-muted/20"
          >
            <line
              x1={0}
              y1={baseline}
              x2={W}
              y2={baseline}
              stroke="hsl(var(--success))"
              strokeWidth={1.4}
            />
            {points.map((p, i) => {
              if (p.total === 0) return null;
              const frac = p.bad / p.total;
              if (frac === 0) return null;
              const h = Math.max(2, frac * (baseline - 6));
              const tone =
                frac >= 0.2 ? "hsl(var(--destructive))" : "hsl(var(--warning, 38 92% 50%))";
              return (
                <line
                  key={i}
                  x1={i * tickW + tickW / 2}
                  x2={i * tickW + tickW / 2}
                  y1={baseline}
                  y2={baseline - h}
                  stroke={tone}
                  strokeWidth={1.6}
                />
              );
            })}
          </svg>
        )}
        <p className="mt-2 text-[11px] tabular-nums text-muted-foreground">
          <b className="text-foreground">{fmtNumber(bad)}</b> / {fmtNumber(total)} calls flagged (CHS &lt; 50)
        </p>
      </CardContent>
    </Card>
  );
}

function peakRates(t: TelemetryAggregate | null): {
  rpm: number;
  tpm: number;
  rpmPct: number;
  tpmPct: number;
} {
  if (!t) return { rpm: 0, tpm: 0, rpmPct: 0, tpmPct: 0 };
  const rpm = t.rpm_series.reduce((m, p) => Math.max(m, p.rpm), 0);
  const tpm = t.tpm_series.reduce((m, p) => Math.max(m, p.tpm), 0);
  return {
    rpm,
    tpm,
    rpmPct: (rpm / RPM_WARNING) * 100,
    tpmPct: (tpm / TPM_WARNING) * 100,
  };
}

function CapacityThermometer({
  label,
  pct,
  tonePct,
  rawValue,
  ceiling,
}: {
  label: string;
  pct: number;
  tonePct?: number;
  rawValue: number;
  ceiling: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const toneSource = tonePct ?? pct;
  const tone =
    toneSource >= THRESHOLDS.RPM_RED_PCT
      ? "destructive"
      : toneSource >= THRESHOLDS.RPM_AMBER_PCT
        ? "amber"
        : "success";
  const fillBg =
    tone === "destructive"
      ? "hsl(var(--destructive))"
      : tone === "amber"
        ? "rgb(245 158 11)"
        : "hsl(var(--success))";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative h-[110px] w-9 overflow-hidden rounded-2xl border border-border bg-background">
        <div
          className="absolute inset-x-0 bottom-0 rounded-2xl"
          style={{ height: `${clamped}%`, background: fillBg }}
        />
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[13px] font-bold tabular-nums">
        {pct.toFixed(0)}%
      </span>
      <span className="text-[10px] tabular-nums text-muted-foreground">
        {fmtNumber(rawValue)} / {fmtNumber(ceiling)}
      </span>
    </div>
  );
}

function CapacityCard({ telemetry }: { telemetry: TelemetryAggregate | null }) {
  const peak = peakRates(telemetry);
  // Thermometer fill % is measured against the hard CEILING (visual saturation
  // bound). Alert tone is driven by the WARNING-relative pct already computed
  // in peakRates, so the bar can be amber/red below 100% fill — matching the
  // earlier-signal semantics.
  const rpmFillPct = (peak.rpm / RPM_CEILING) * 100;
  const tpmFillPct = (peak.tpm / TPM_CEILING) * 100;
  return (
    <Card>
      <CardContent className="p-4">
        <SectionLabel>Saturation vs ceiling</SectionLabel>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <CapacityThermometer
            label="RPM"
            pct={rpmFillPct}
            tonePct={peak.rpmPct}
            rawValue={peak.rpm}
            ceiling={RPM_CEILING}
          />
          <CapacityThermometer
            label="TPM"
            pct={tpmFillPct}
            tonePct={peak.tpmPct}
            rawValue={peak.tpm}
            ceiling={TPM_CEILING}
          />
        </div>
        <p className="mt-3 text-[10.5px] leading-snug text-muted-foreground">
          Peak observed in window vs configured ceiling. Tone shifts at the warn band ({fmtNumber(RPM_WARNING)} RPM / {fmtNumber(TPM_WARNING)} TPM) for early signal before the hard rate-limit.
        </p>
      </CardContent>
    </Card>
  );
}

export function TelemetryReactiveWidget({
  telemetry,
  calls,
}: {
  telemetry: TelemetryAggregate | null;
  calls: CallRecord[];
}) {
  const alerts = buildAlerts(telemetry, calls);
  return (
    <div className="space-y-3">
      <ActiveAlertsCard alerts={alerts} />
      <ErrorRibbonCard calls={calls} />
      <CapacityCard telemetry={telemetry} />
    </div>
  );
}
