"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Search,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChsBadge } from "@/components/chs-badge";
import { Input } from "@/components/ui/input";
import { OutcomeBadge } from "@/components/outcome-badge";
import { SentimentBadge } from "@/components/sentiment-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { chsTier } from "@/lib/chs-thresholds";
import type { CallRecord } from "@/types/api-types";

type SortKey =
  | "created_at"
  | "call_id"
  | "mc_number"
  | "carrier_name"
  | "notes"
  | "call_outcome"
  | "lane_origin"
  | "lane_dest"
  | "sentiment"
  | "case_health_score";

type SortDir = "asc" | "desc";

// Locked column order for the Call Logs main view — the dashboard contract
// pairs this 9-column shape with the drilldown that surfaces everything else
// (created_at, duration, rate, transcript). Reorder/insert/remove only as a
// coordinated change with the drilldown spec, or the two views drift apart.
const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "created_at", label: "Time" },
  { key: "call_id", label: "Call" },
  { key: "mc_number", label: "MC #" },
  { key: "carrier_name", label: "Carrier" },
  { key: "notes", label: "Notes" },
  { key: "call_outcome", label: "Outcome" },
  { key: "lane_origin", label: "Origin" },
  { key: "lane_dest", label: "Destination" },
  { key: "sentiment", label: "Sentiment" },
  { key: "case_health_score", label: "CHS", align: "right" },
];

function pickValue(r: CallRecord, key: SortKey): string | number | null {
  switch (key) {
    case "created_at":
      return r.created_at ? Date.parse(r.created_at) : null;
    case "call_outcome":
      return r.call_outcome ?? null;
    case "case_health_score":
      return r.case_health_score ?? null;
    case "notes":
      return r.notes ?? null;
    case "lane_origin":
      return r.lane_origin ?? null;
    case "lane_dest":
      return r.lane_dest ?? null;
    default:
      return (r as Record<string, unknown>)[key] as string | number | null;
  }
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${month} ${day}, ${hh}:${mm}`;
}

function shortCallId(callId: string | null | undefined): string {
  if (!callId) return "—";
  return callId.length > 10 ? callId.slice(-8) : callId;
}

export function CallsTable({
  calls,
  showSearch = true,
}: {
  calls: CallRecord[];
  showSearch?: boolean;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  const filteredCalls = useMemo(() => {
    if (!search) return calls;
    const q = search.toLowerCase();
    return calls.filter(
      (c) =>
        (c.mc_number ?? "").toLowerCase().includes(q) ||
        (c.carrier_name ?? "").toLowerCase().includes(q) ||
        (c.legal_name ?? "").toLowerCase().includes(q) ||
        (c.notes ?? "").toLowerCase().includes(q) ||
        (c.lane_origin ?? "").toLowerCase().includes(q) ||
        (c.lane_dest ?? "").toLowerCase().includes(q) ||
        (c.audit_remarks ?? "").toLowerCase().includes(q) ||
        (c.transcript ?? "").toLowerCase().includes(q) ||
        (c.call_id ?? "").toLowerCase().includes(q),
    );
  }, [calls, search]);

  const sorted = useMemo(() => {
    const copy = [...filteredCalls];
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
  }, [filteredCalls, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  function openCall(callId: string | null | undefined) {
    if (!callId) return;
    router.push(`/dashboard/calls/${encodeURIComponent(callId)}`);
  }

  const searchBar = showSearch ? (
    <div className="relative max-w-md">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by MC, carrier, lane, transcript..."
        className="pl-8 pr-8"
        aria-label="Search calls"
      />
      {search && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={() => setSearch("")}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  ) : null;

  if (!calls.length) {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          No calls in the selected window. Adjust the date range or wait for the next inbound.
        </div>
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div className="space-y-3">
        {searchBar}
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          No calls match your search. Adjust the query or clear filters.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sigma-grid">
      {searchBar}
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => {
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
                  {/* Sort affordance is a real <button> inside <TableHead> so
                      it's reachable via Tab and activatable with Space/Enter;
                      `aria-sort` on the cell + descriptive `aria-label` on the
                      button give screen readers both the current state and the
                      next action. */}
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
            const callId = r.call_id ?? null;
            // Legacy fallback to `r.outcome` for rows written before the
            // `outcome → call_outcome` rename — the `as { outcome? }` cast
            // bypasses the typed `CallRecord` shape on purpose. Drop both the
            // cast and the fallback in the same pass that retires the old key.
            const outcome =
              r.call_outcome ?? (r as { outcome?: string | null }).outcome ?? null;
            // CHS tier comes from the shared threshold module so the table,
            // KPI cards, and badges all bucket scores identically — collapse
            // the 4 functional tiers into the 3 visual `data-tier` slots the
            // sigma grid styles (good/warn/bad), unknown stays unstyled.
            const chs = r.case_health_score ?? null;
            const tier = chsTier(chs);
            const chsTierLabel =
              tier === "unknown"
                ? undefined
                : tier === "exemplary" || tier === "healthy"
                  ? "good"
                  : tier === "ok"
                    ? "warn"
                    : "bad";
            return (
              <TableRow
                key={callId ?? r.id ?? i}
                className={cn(
                  callId &&
                    "cursor-pointer transition-colors hover:bg-muted/40",
                )}
                onClick={() => openCall(callId)}
              >
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                  {fmtTime(r.created_at)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {callId ? (
                    <span className="text-foreground">
                      {shortCallId(callId)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.mc_number ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[180px] truncate">
                  {r.carrier_name ?? r.legal_name ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell
                  className="max-w-[220px] truncate text-xs text-muted-foreground"
                  title={r.notes ?? undefined}
                >
                  {r.notes ?? (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <OutcomeBadge value={outcome} />
                </TableCell>
                <TableCell className="max-w-[140px] truncate text-xs">
                  {r.lane_origin ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[140px] truncate text-xs">
                  {r.lane_dest ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <SentimentBadge value={r.sentiment} />
                </TableCell>
                <TableCell
                  className="text-right sigma-chs"
                  data-tier={chsTierLabel}
                >
                  <ChsBadge value={r.case_health_score} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function CallsSourceBadge({
  source,
}: {
  source: "v1-calls" | "v1-dashboard-calls" | "fallback-empty";
}) {
  if (source === "fallback-empty") {
    return (
      <Badge variant="warning" className="ml-2 font-normal">
        offline · retrying
      </Badge>
    );
  }
  return null;
}
