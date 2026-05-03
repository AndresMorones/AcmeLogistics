import { fmtNumber, fmtPct } from "@/lib/format";
import { CHS_EXEMPLARY, CHS_PASS } from "@/lib/chs-thresholds";
import type {
  FunnelMetrics,
  OperationalMetrics,
  QualityMetrics,
  TelemetryAggregate,
} from "@/types/api-types";

import { SigmaKpiCell } from "./sigma-kpi-cell";

const SUCCESS_BOOK_RATE_TARGET = 0.5;
const SUCCESS_AHT_FLOOR_S = 30;
const SUCCESS_AHT_CEIL_S = 600;
const TARGET_TOTAL_CALLS_BAR_REF = 200;

function chsBgTone(score: number | null | undefined): "bad" | "warn" | "good" | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  if (score < CHS_PASS) return "bad";
  if (score < CHS_EXEMPLARY) return "warn";
  return "good";
}

function fmtMmSs(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function ahtBar(seconds: number | null | undefined): number {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return 0;
  if (seconds <= SUCCESS_AHT_FLOOR_S) return 1;
  if (seconds >= SUCCESS_AHT_CEIL_S) return 0;
  return 1 - (seconds - SUCCESS_AHT_FLOOR_S) / (SUCCESS_AHT_CEIL_S - SUCCESS_AHT_FLOOR_S);
}

const DROP_OFF_BAR_CEIL_PCT = 30;
const TOOL_ERR_BAR_CEIL_PCT = 20;

export type SigmaKpiBandProps = {
  funnel: FunnelMetrics;
  operational: OperationalMetrics;
  quality: QualityMetrics;
  telemetry: TelemetryAggregate | null;
};

// Frozen merged-cell strip: composes 6 KPI cells into a sticky band that sits
// below the global header (top-14 / z-30 < header z-40). Inverse-bar metrics
// (AHT, no-match, tool-error) pre-invert their magnitude here so the cell
// always renders "fuller bar = better" — do not "fix" the formulas downstream.
export function SigmaKpiBand({
  funnel,
  operational,
  quality,
  telemetry,
}: SigmaKpiBandProps): React.JSX.Element {
  const totalCalls = funnel.total_calls ?? 0;
  const totalCallsBar = Math.min(totalCalls / TARGET_TOTAL_CALLS_BAR_REF, 1);

  const bookedRatePct = funnel.booking_rate_pct ?? 0;
  const bookedRateBar = Math.min(bookedRatePct / 100 / SUCCESS_BOOK_RATE_TARGET, 1);

  const chs = quality.avg_case_health_score;
  const chsBar = chs !== null && chs !== undefined ? Math.min(chs / 100, 1) : 0;
  const chsTone = chsBgTone(chs);

  const aht = operational.avg_duration_seconds;
  const ahtPos = aht !== null && aht !== undefined && aht <= SUCCESS_AHT_CEIL_S;

  const noMatchPct = operational.no_match_pct ?? null;
  const noMatchBar =
    noMatchPct !== null
      ? Math.min(noMatchPct / DROP_OFF_BAR_CEIL_PCT, 1)
      : 0;
  const noMatchPos = noMatchPct !== null && noMatchPct < 10;

  const toolErrPct = telemetry?.totals.tool_error_rate_pct ?? null;
  const toolErrBar =
    toolErrPct !== null
      ? Math.min(toolErrPct / TOOL_ERR_BAR_CEIL_PCT, 1)
      : 0;
  const toolErrPos = toolErrPct !== null && toolErrPct < 5;

  return (
    <div
      className={[
        "sticky top-14 z-30",
        "border-y border-border bg-background",
        "supports-[backdrop-filter]:bg-background/85",
        "supports-[backdrop-filter]:backdrop-blur-md",
      ].join(" ")}
      role="group"
      aria-label="Calls KPI band"
    >
      <div className="grid grid-cols-3 sm:grid-cols-6">
        <SigmaKpiCell
          label="Total calls"
          value={fmtNumber(totalCalls)}
          bar={totalCallsBar}
          pos
          hint={`vs ${TARGET_TOTAL_CALLS_BAR_REF} ref`}
        />
        <SigmaKpiCell
          label="Booked rate"
          value={fmtPct(bookedRatePct)}
          bar={bookedRateBar}
          pos={bookedRatePct > 0}
          hint={`tgt ${(SUCCESS_BOOK_RATE_TARGET * 100).toFixed(0)}%`}
        />
        <SigmaKpiCell
          label="Avg CHS"
          value={chs !== null && chs !== undefined ? chs.toFixed(1) : "—"}
          bar={chsBar}
          pos={(chs ?? 0) >= CHS_PASS}
          bgTone={chsTone}
          hint={`/100 · ≥${CHS_PASS} passes`}
          isMobileRowEnd
        />
        <SigmaKpiCell
          label="Avg handle"
          value={fmtMmSs(aht)}
          bar={ahtBar(aht)}
          pos={ahtPos}
          hint="mm:ss · shorter better"
        />
        <SigmaKpiCell
          label="No match"
          value={noMatchPct !== null ? fmtPct(noMatchPct) : "—"}
          bar={noMatchBar}
          pos={noMatchPos}
          hint="no matching load found"
        />
        <SigmaKpiCell
          label="Tool error rate"
          value={toolErrPct !== null ? fmtPct(toolErrPct) : "—"}
          bar={toolErrBar}
          pos={toolErrPos}
          hint="errors + timeouts"
          isLast
        />
      </div>
    </div>
  );
}
