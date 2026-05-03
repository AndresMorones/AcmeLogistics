import { PipelineBoard } from "@/components/sales-pipeline/pipeline-board";
import { getRecentBookings, parseFilterParams } from "@/lib/api-client";

// 30s ISR matches the FastAPI TTLCache window; the SSE live-refresh channel
// pushes invalidations on top so new bookings surface before the next revalidate.
export const revalidate = 30;

type Props = { searchParams: Promise<{ from?: string; to?: string }> };

export default async function SalesPage({ searchParams }: Props) {
  const sp = await searchParams;
  // 7-day default from parseFilterParams is the app-wide convention; the
  // Telemetry tab on the Overview page is the sole exception (own range chip).
  const filters = parseFilterParams(sp);

  const bookingsRes = await getRecentBookings(filters);

  return (
    <div className="space-y-4">
      <PipelineBoard bookings={bookingsRes.bookings} />
    </div>
  );
}
