"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fmtNumber,
  fmtPct,
  fmtRelative,
  signedTone,
  signedToneClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CarrierRollupRow } from "@/types/api-types";

type SortKey =
  | "mc_number"
  | "carrier_name"
  | "call_count"
  | "booked_count"
  | "booking_rate_pct"
  | "avg_booking_margin_pct"
  | "last_call_at";

type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "mc_number", label: "MC #" },
  { key: "carrier_name", label: "Carrier" },
  { key: "call_count", label: "Calls", align: "right" },
  { key: "booked_count", label: "Bookings", align: "right" },
  { key: "booking_rate_pct", label: "Booking rate", align: "right" },
  // Header reads "(±) listed rate" — sign is rendered explicitly in the cell so
  // users see direction without having to read the column legend.
  { key: "avg_booking_margin_pct", label: "(±) listed rate", align: "right" },
  { key: "last_call_at", label: "Last seen", align: "right" },
];

function pickValue(r: CarrierRollupRow, key: SortKey): string | number | null {
  switch (key) {
    case "mc_number":
      return r.mc_number ?? null;
    case "carrier_name":
      return r.carrier_name ?? null;
    case "call_count":
      return r.call_count;
    case "booked_count":
      return r.booked_count;
    case "booking_rate_pct":
      return r.booking_rate_pct;
    case "avg_booking_margin_pct":
      return r.avg_booking_margin_pct ?? null;
    case "last_call_at": {
      if (!r.last_call_at) return null;
      const t = new Date(r.last_call_at).getTime();
      return Number.isNaN(t) ? null : t;
    }
  }
}

export function CarriersTable({ rows }: { rows: CarrierRollupRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("call_count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = pickValue(a, sortKey);
      const bv = pickValue(b, sortKey);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-3 sigma-grid">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => {
              // Header is a real <button> inside <TableHead> so screen readers
              // announce sort state via aria-sort and keyboard users get focus
              // ring + Enter/Space activation for free.
              const isActive = c.key === sortKey;
              const ariaSort: "ascending" | "descending" | "none" = isActive
                ? sortDir === "asc"
                  ? "ascending"
                  : "descending"
                : "none";
              return (
                <TableHead
                  key={c.key}
                  aria-sort={ariaSort}
                  className={cn(
                    "select-none",
                    c.align === "right" && "text-right",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-sm px-1 -mx-1 hover:text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      c.align === "right" && "justify-end w-full",
                    )}
                    aria-label={`Sort by ${c.label}, currently ${
                      isActive ? (sortDir === "asc" ? "ascending" : "descending") : "unsorted"
                    }`}
                  >
                    {c.label}
                    {isActive ? (
                      sortDir === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )
                    ) : (
                      <ChevronsUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r, i) => {
            // Tone palette is centralized in lib/format so this column matches the
            // sign coloring used by the economics widgets and rep cards — positive
            // (saved vs list) is good/green, negative (concession) is bad/red.
            const marginPct = r.avg_booking_margin_pct ?? null;
            const marginTone = signedTone(marginPct);
            const marginToneClass = signedToneClass(marginTone);
            const marginPrefix =
              marginTone === "positive"
                ? "+"
                : marginTone === "negative"
                  ? "−"
                  : "";
            const marginValue =
              marginPct === null
                ? "—"
                : `${marginPrefix}${fmtPct(Math.abs(marginPct))}`;
            return (
              <TableRow key={r.mc_number ?? `row-${i}`}>
                <TableCell className="font-mono text-xs">
                  {r.mc_number ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[260px] truncate">
                  {r.carrier_name ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNumber(r.call_count)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNumber(r.booked_count)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtPct(r.booking_rate_pct)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    marginToneClass,
                  )}
                >
                  {marginValue}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                  {r.last_call_at ? fmtRelative(r.last_call_at) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
