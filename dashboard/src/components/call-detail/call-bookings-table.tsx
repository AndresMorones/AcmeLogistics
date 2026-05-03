import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fmtCurrency,
  fmtDateTime,
  fmtNumber,
  signedTone,
  signedToneClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CallBookingRow } from "@/lib/api-client";

function lane(
  oc?: string | null,
  os?: string | null,
  dc?: string | null,
  ds?: string | null,
): string {
  const o = [oc, os].filter(Boolean).join(", ");
  const d = [dc, ds].filter(Boolean).join(", ");
  if (!o && !d) return "—";
  return `${o || "—"} → ${d || "—"}`;
}

function RateDiff({
  list,
  apply,
}: {
  list: number | null | undefined;
  apply: number | null | undefined;
}) {
  if (apply === null || apply === undefined) {
    return <span className="font-mono text-muted-foreground">—</span>;
  }
  if (list === null || list === undefined) {
    return (
      <span className="font-mono tabular-nums">{fmtCurrency(apply)}</span>
    );
  }
  // Sign convention: positive delta = booked under list (broker margin); routed
  // through signedTone so green/red matches every other dollar delta in the app.
  const dollarDelta = list - apply;
  const pctDelta = list > 0 ? (dollarDelta / list) * 100 : null;
  const tone = signedToneClass(signedTone(dollarDelta));
  return (
    <div className="flex flex-col text-right">
      <span className="font-mono text-sm font-semibold tabular-nums">
        {fmtCurrency(apply)}
      </span>
      <span className="text-[11px] text-muted-foreground tabular-nums">
        list {fmtCurrency(list)}
      </span>
      <span className={cn("text-[11px] font-medium tabular-nums", tone)}>
        {dollarDelta >= 0 ? "+" : ""}
        {fmtCurrency(dollarDelta)}
        {pctDelta !== null
          ? ` (${pctDelta >= 0 ? "+" : ""}${pctDelta.toFixed(1)}%)`
          : ""}
      </span>
    </div>
  );
}

export function CallBookingsTable({
  bookings,
}: {
  bookings: CallBookingRow[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Bookings on this call
          {bookings.length > 0 ? (
            <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">
              ({bookings.length})
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {bookings.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            No bookings on this call
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Load ID</TableHead>
                <TableHead>Lane</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead>Commodity</TableHead>
                <TableHead className="text-right">Pieces</TableHead>
                <TableHead>Dimensions</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map((b, i) => {
                const loadId = b.load_id ?? b.load?.load_id ?? "—";
                const laneStr = lane(
                  b.load?.origin_city,
                  b.load?.origin_state,
                  b.load?.destination_city,
                  b.load?.destination_state,
                );
                const weight = b.load?.weight;
                const pieces = b.load?.num_of_pieces;
                return (
                  <TableRow key={b.id ?? i}>
                    <TableCell className="font-mono text-xs">
                      {loadId}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {laneStr}
                    </TableCell>
                    <TableCell className="text-xs">
                      {fmtDateTime(b.load?.pickup_datetime)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {b.load?.equipment_type ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <RateDiff
                        list={b.load?.loadboard_rate}
                        apply={b.apply_rate}
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {weight !== null && weight !== undefined
                        ? `${fmtNumber(weight)} lbs`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {b.load?.commodity_type ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {pieces !== null && pieces !== undefined
                        ? fmtNumber(pieces)
                        : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {b.load?.dimensions ?? "—"}
                    </TableCell>
                    <TableCell
                      className="max-w-[20ch] truncate text-xs text-muted-foreground"
                      title={b.load?.notes ?? undefined}
                    >
                      {b.load?.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
