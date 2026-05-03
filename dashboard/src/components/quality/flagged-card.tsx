"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import type { CallRecord } from "@/types/api-types";
import { Card, CardContent } from "@/components/ui/card";
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
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CHS_PASS, isFlagged } from "@/lib/chs-thresholds";

type SortKey =
  | "created_at"
  | "mc_number"
  | "call_outcome"
  | "sentiment"
  | "case_health_score"
  | "audit_remarks";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; align?: "left" | "right" }[] = [
  { key: "created_at", label: "Time" },
  { key: "mc_number", label: "MC" },
  { key: "call_outcome", label: "Outcome" },
  { key: "sentiment", label: "Sentiment" },
  { key: "case_health_score", label: "CHS", align: "right" },
  { key: "audit_remarks", label: "Audit remark" },
];

function pickValue(r: CallRecord, key: SortKey): string | number | null {
  switch (key) {
    case "created_at":
      return r.created_at ? Date.parse(r.created_at) : null;
    case "case_health_score":
      return r.case_health_score ?? null;
    case "mc_number":
      return r.mc_number ?? null;
    case "call_outcome":
      return r.call_outcome ?? null;
    case "sentiment":
      return r.sentiment ?? null;
    case "audit_remarks":
      return r.audit_remarks ?? null;
  }
}

export function FlaggedCard({ calls }: { calls: CallRecord[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Flagged set = CHS strictly below CHS_PASS. Sourced from chs-thresholds so
  // the headline count, this drilldown, and Low-CHS list cannot drift apart.
  const flagged = useMemo(
    () => calls.filter((c) => isFlagged(c.case_health_score)),
    [calls],
  );

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...flagged].sort((a, b) => {
      const av = pickValue(a, sortKey);
      const bv = pickValue(b, sortKey);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [flagged, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "created_at" || key === "case_health_score" ? "desc" : "asc");
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            flagged calls drilldown · CHS &lt; {CHS_PASS}
          </p>
          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
            {flagged.length} total · sortable
          </p>
        </div>

        <div className="border-t border-border pt-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <p className="sr-only">flagged calls drilldown · CHS &lt; {CHS_PASS}</p>
          </div>

          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
              <p className="text-sm text-muted-foreground">
                No flagged calls in this window.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Quality threshold: CHS &lt; {CHS_PASS}.
              </p>
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    {COLUMNS.map((col) => {
                      const active = col.key === sortKey;
                      const Icon = active
                        ? sortDir === "asc"
                          ? ChevronUp
                          : ChevronDown
                        : ChevronsUpDown;
                      return (
                        <TableHead
                          key={col.key}
                          className={cn(
                            "h-10 cursor-pointer select-none text-[11px] font-medium uppercase tracking-wider hover:text-foreground",
                            col.align === "right" ? "text-right" : "text-left",
                          )}
                          onClick={() => toggleSort(col.key)}
                        >
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              col.align === "right" && "justify-end",
                            )}
                          >
                            {col.label}
                            <Icon
                              className={cn(
                                "h-3 w-3",
                                active
                                  ? "text-foreground"
                                  : "text-muted-foreground/60",
                              )}
                            />
                          </span>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((c) => {
                    const callId = c.call_id ?? null;
                    return (
                    <TableRow
                      key={callId ?? `${c.id}`}
                      className={cn(
                        "text-xs",
                        callId &&
                          "cursor-pointer transition-colors hover:bg-muted/40",
                      )}
                      onClick={() => {
                        if (callId)
                          router.push(`/dashboard/calls/${encodeURIComponent(callId)}`);
                      }}
                    >
                      <TableCell className="h-10 whitespace-nowrap align-top text-muted-foreground">
                        {fmtRelative(c.created_at)}
                      </TableCell>
                      <TableCell className="h-10 whitespace-nowrap align-top font-mono">
                        {c.mc_number ? `MC ${c.mc_number}` : "—"}
                      </TableCell>
                      <TableCell className="h-10 align-top">
                        <OutcomeBadge value={c.call_outcome} className="text-[11px]" />
                      </TableCell>
                      <TableCell className="h-10 align-top">
                        <SentimentBadge value={c.sentiment} className="text-[11px]" />
                      </TableCell>
                      <TableCell className="h-10 align-top text-right tabular-nums text-destructive">
                        {c.case_health_score ?? "—"}
                      </TableCell>
                      <TableCell className="h-10 max-w-[480px] whitespace-normal break-words align-top leading-relaxed text-muted-foreground">
                        {c.audit_remarks?.trim() || "—"}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export { FlaggedCard as FlaggedDrilldown };
