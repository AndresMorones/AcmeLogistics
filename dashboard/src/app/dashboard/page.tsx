import { Suspense } from "react";

import {
  getCalls,
  getEconomics,
  getFunnel,
  getOperational,
  getQuality,
  getRecentBookings,
  getTelemetry,
  parseFilterParams,
} from "@/lib/api-client";
import { fmtNumber, fmtPct } from "@/lib/format";
import { CHS_PASS } from "@/lib/chs-thresholds";
import { KpiCard } from "@/components/kpi-card";
import { RateSummaryCard } from "@/components/rate-summary-card";
import { Card, CardContent } from "@/components/ui/card";
import { OutcomeStackedBar } from "@/components/charts/outcome-stacked-bar";
import { RevenueDailyChart } from "@/components/charts/revenue-daily";
import { CallsPerDayStacked } from "@/components/charts/calls-per-day-stacked";
import { ChsTrendChart } from "@/components/quality/chs-trend-chart";
import { FlaggedCard } from "@/components/quality/flagged-card";
import { MonitorTabs } from "@/components/monitor-tabs";
import {
  bucketByOutcome,
  bucketBySentiment,
  bucketGranularity,
} from "@/lib/daily-buckets";
import { CostPerBookingCard } from "@/components/telemetry/cost-per-booking-card";
import { LatencyPercentilesCard } from "@/components/telemetry/latency-percentiles-card";
import { RpmTpmChart } from "@/components/telemetry/rpm-tpm-chart";
import { TelemetryControls } from "@/components/telemetry/telemetry-controls";
import { TelemetryEmptyState } from "@/components/telemetry/telemetry-empty-state";
import { TelemetryKpiStrip } from "@/components/telemetry/telemetry-kpi-strip";
import { Skeleton } from "@/components/ui/skeleton";

// 30s ISR matches the FastAPI TTLCache window. Next.js keys the cache per
// searchParams combination, so changing ?from/?to/?range bypasses cache instantly;
// only repeated identical-param renders inside the 30s window are served stale.
export const revalidate = 30;

type Props = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    range?: string;
    bucket?: string;
  }>;
};

function rangeToCutoff(range: string | undefined): { from?: Date; bucket: number } {
  if (!range) return { bucket: 1 };
  const now = Date.now();
  const map: Record<string, { hours: number; bucket: number }> = {
    "1h": { hours: 1, bucket: 1 },
    "3h": { hours: 3, bucket: 1 },
    "12h": { hours: 12, bucket: 5 },
    "1d": { hours: 24, bucket: 5 },
    "3d": { hours: 72, bucket: 15 },
    "1w": { hours: 168, bucket: 60 },
  };
  const m = map[range];
  if (!m) return { bucket: 1 };
  return { from: new Date(now - m.hours * 60 * 60 * 1000), bucket: m.bucket };
}

export default async function DashboardPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters = parseFilterParams(sp);

  // Telemetry uses its own range chip — decoupled from the global date picker
  // so the heavy transcript parse stays bounded regardless of how wide the
  // global filter goes, and so operators can hold economics on a wide window
  // while watching live telemetry on a narrow one.
  const telemetryWindow = rangeToCutoff(sp.range ?? "12h");
  const telemetryFrom = telemetryWindow.from;
  const telemetryTo = new Date();

  const [
    funnel,
    economics,
    operational,
    quality,
    callsForQuality,
    bookings,
    telemetry,
  ] = await Promise.all([
    getFunnel(filters),
    getEconomics(filters),
    getOperational(filters),
    getQuality(filters),
    getCalls(200, filters),
    getRecentBookings(filters),
    getTelemetry({
      from: telemetryFrom,
      to: telemetryTo,
      bucketMinutes: telemetryWindow.bucket,
      maxRuns: 200,
    }),
  ]);

  const noDataYet = (funnel.total_calls ?? 0) === 0;
  const granularity = bucketGranularity(filters.from, filters.to);
  const dailyOutcome = bucketByOutcome(
    callsForQuality.calls,
    granularity,
    filters.from,
    filters.to,
  );
  const dailySentiment = bucketBySentiment(
    callsForQuality.calls,
    granularity,
    filters.from,
    filters.to,
  );

  const economicsContent = (
    <Card>
      <CardContent className="p-3">
        <RevenueDailyChart
          bookings={bookings.bookings}
          height={300}
          from={filters.from}
          to={filters.to}
        />
      </CardContent>
    </Card>
  );

  const operationalContent = (
    <>
      <Card>
        <CardContent className="p-3">
          <OutcomeStackedBar byOutcome={funnel.by_outcome ?? {}} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3">
          <CallsPerDayStacked buckets={dailyOutcome} height={200} />
        </CardContent>
      </Card>
    </>
  );

  const qualityContent = (
    <>
      <Card>
        <CardContent className="p-3">
          <ChsTrendChart series={quality.sparkline ?? []} />
        </CardContent>
      </Card>
      <FlaggedCard calls={callsForQuality.calls} />
    </>
  );

  const telemetryContent =
    telemetry === null ? (
      <TelemetryEmptyState reason="hr_unavailable" />
    ) : (
      <div className="pit-surface space-y-4 border border-border p-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-primary">
            Telemetry · Live
          </span>
          <span
            className="text-[10px] uppercase tracking-wider text-muted-foreground"
            title="Computed from transcript wall-clock (dashboard-side); HR latency columns are NULL by design — the upstream /runs API was retired."
          >
            Source · transcript-derived
          </span>
        </div>
        <TelemetryControls />
        <Suspense fallback={<Skeleton className="h-24 w-full" />}>
          <TelemetryKpiStrip data={telemetry} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-[480px] w-full" />}>
          <RpmTpmChart rpm={telemetry.rpm_series} tpm={telemetry.tpm_series} />
        </Suspense>
        <CostPerBookingCard
          telemetry={telemetry}
          calls={callsForQuality.calls}
          bookingsCount={economics.total_calls_with_rate ?? 0}
        />
        <LatencyPercentilesCard
          latency={telemetry.latency}
          series={telemetry.latency_series ?? []}
          totalRuns={telemetry.totals?.runs ?? 0}
          byTool={telemetry.latency_by_tool}
        />
      </div>
    );

  return (
    <div className="space-y-6">
      {noDataYet ? (
        <div className="rounded-md border border-dashed border-border bg-card/40 px-4 py-6 text-center">
          <p className="text-sm font-medium">No calls in this window yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Place a test call from HappyRobot to populate this view, or widen
            the date range.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Calls"
          value={fmtNumber(funnel.total_calls)}
          deltaPct={funnel.delta_pct_vs_prior ?? null}
        />
        <KpiCard
          label="Bookings"
          value={fmtNumber(economics.total_calls_with_rate)}
          deltaPct={economics.delta_pct_vs_prior ?? null}
        />
        <KpiCard
          label="Booked rate"
          value={fmtPct(funnel.booking_rate_pct)}
          deltaPct={funnel.delta_pct_vs_prior ?? null}
        />
        <RateSummaryCard economics={economics} />
        <KpiCard
          label="Quality score"
          value={
            quality.avg_case_health_score !== null ? (
              <span
                className={
                  quality.avg_case_health_score < CHS_PASS
                    ? "text-destructive"
                    : undefined
                }
              >
                {quality.avg_case_health_score.toFixed(1)}
              </span>
            ) : (
              "—"
            )
          }
          deltaPct={quality.delta_pct_vs_prior ?? null}
          hint="/100 · ≥70 passes"
        />
      </div>

      <MonitorTabs
        funnel={funnel}
        economics={economics}
        operational={operational}
        calls={callsForQuality.calls}
        dailySentiment={dailySentiment}
        telemetry={telemetry}
        economicsContent={economicsContent}
        operationalContent={operationalContent}
        qualityContent={qualityContent}
        telemetryContent={telemetryContent}
      />
    </div>
  );
}
