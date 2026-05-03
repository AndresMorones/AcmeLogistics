import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CallsSourceBadge } from "@/components/calls-table";
import { CallsListWithFilters } from "@/components/calls-filters/calls-list-with-filters";
import { SigmaKpiBand } from "@/components/sigma-kpi-band/sigma-kpi-band";
import {
  getCalls,
  getFunnel,
  getOperational,
  getQuality,
  getTelemetry,
  parseFilterParams,
  type DashboardFilters,
} from "@/lib/api-client";

// 30s ISR matches the FastAPI TTLCache window; SSE live-refresh pushes
// invalidations on top. Cache is keyed per searchParams, so filters propagate immediately.
export const revalidate = 30;

type Props = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    outcome?: string;
    sentiment?: string;
    mc?: string;
  }>;
};

export default async function CallsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters: DashboardFilters = parseFilterParams(sp);

  const [{ calls, source }, funnel, operational, quality, telemetry] =
    await Promise.all([
      getCalls(200, filters),
      getFunnel(filters),
      getOperational(filters),
      getQuality(filters),
      getTelemetry({
        from: filters.from,
        to: filters.to,
        bucketMinutes: 5,
        maxRuns: 200,
      }),
    ]);

  return (
    <div className="space-y-6">
      <SigmaKpiBand
        funnel={funnel}
        operational={operational}
        quality={quality}
        telemetry={telemetry}
      />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center text-sm">
            Call log
            <CallsSourceBadge source={source} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CallsListWithFilters calls={calls} />
        </CardContent>
      </Card>
    </div>
  );
}
