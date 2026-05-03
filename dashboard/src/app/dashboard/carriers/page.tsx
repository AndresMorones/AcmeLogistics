import { CarriersListWithFilters } from "@/components/carriers-filters/carriers-list-with-filters";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCarriers,
  parseFilterParams,
  type DashboardFilters,
} from "@/lib/api-client";
import { fmtNumber } from "@/lib/format";

// 30s ISR matches the FastAPI TTLCache window; the SSE live-refresh channel
// pushes invalidations on top so users see new bookings before the next revalidate.
export const revalidate = 30;

type Props = { searchParams: Promise<{ from?: string; to?: string }> };

export default async function CarriersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters: DashboardFilters = parseFilterParams(sp);

  const rollup = await getCarriers(filters);
  const rows = rollup.top_carriers;

  const totalCalls = rows.reduce((acc, r) => acc + r.call_count, 0);
  const totalBookings = rows.reduce((acc, r) => acc + r.booked_count, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          label="Unique carriers"
          value={fmtNumber(rollup.total_unique_carriers)}
        />
        <KpiCard label="Total calls" value={fmtNumber(totalCalls)} />
        <KpiCard label="Total bookings" value={fmtNumber(totalBookings)} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Carriers</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              No carriers in this window.
            </div>
          ) : (
            <CarriersListWithFilters rows={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
