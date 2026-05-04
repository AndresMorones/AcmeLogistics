"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fmtCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CHS_EXEMPLARY, CHS_PASS } from "@/lib/chs-thresholds";
import { useFocusTrap } from "@/lib/use-focus-trap";
import type { RecentBooking } from "@/types/api-types";

import type { PipelineEntry, PipelineState } from "./use-pipeline-state";

const REJECT_REASONS = [
  "Above ceiling rate",
  "Poor case-health score",
  "Wrong lane / equipment",
  "Carrier history",
  "Other",
] as const;

type Props = {
  booking: RecentBooking | null;
  state: PipelineState;
  entry: PipelineEntry | null;
  onClose: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onReset: () => void;
};

function fullLane(b: RecentBooking): string {
  const o = [b.load?.origin_city, b.load?.origin_state].filter(Boolean).join(", ");
  const d = [b.load?.destination_city, b.load?.destination_state].filter(Boolean).join(", ");
  if (!o && !d) return "Unknown lane";
  return `${o || "??"}  →  ${d || "??"}`;
}

export function PipelineDetailPanel({
  booking,
  state,
  entry,
  onClose,
  onApprove,
  onReject,
  onReset,
}: Props) {
  const [rejectMode, setRejectMode] = React.useState(false);
  const [reasonChoice, setReasonChoice] = React.useState<string>(REJECT_REASONS[0]);
  const [reasonText, setReasonText] = React.useState("");
  const dialogRef = React.useRef<HTMLElement>(null);
  // Slide-over is a true modal dialog — trap Tab inside the panel so keyboard users cannot land
  // on the dimmed page underneath while the overlay is intercepting clicks. Trap toggles with
  // booking presence so the page regains focus order the moment the panel unmounts.
  useFocusTrap(dialogRef, booking !== null);

  React.useEffect(() => {
    setRejectMode(false);
    setReasonChoice(REJECT_REASONS[0]);
    setReasonText("");
  }, [booking?.booking_id]);

  React.useEffect(() => {
    if (!booking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [booking, onClose]);

  if (!booking) return null;

  const apply = booking.apply_rate;
  const list = booking.load?.loadboard_rate ?? null;
  // Captured-margin convention (list - apply): positive = booked under list = good (green).
  // Approve/Reject and the rendered reason live only in localStorage via use-pipeline-state — no
  // backend mutation fires from this panel, so colour-flips here are display-only, never persisted.
  const marginDollars =
    apply != null && list != null ? list - apply : null;
  const marginPct =
    apply != null && list != null && list !== 0
      ? ((list - apply) / list) * 100
      : null;
  const chs = booking.call?.case_health_score ?? null;
  const duration = booking.call?.duration_seconds ?? null;

  const handleSubmitReject = () => {
    const reason =
      reasonChoice === "Other" && reasonText.trim()
        ? reasonText.trim()
        : reasonChoice;
    onReject(reason);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close detail panel"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
      />

      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Booking ${booking.booking_id} detail`}
        className={cn(
          "fixed right-0 top-0 z-50 flex h-screen w-[460px] flex-col",
          "border-l border-border bg-card shadow-2xl",
        )}
      >
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{booking.mc_number}</span>
              <StatePill state={state} />
            </div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground">
              Booking #{booking.booking_id} · call {booking.call_id.slice(0, 8)}…
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            esc
          </button>
        </div>

        <div className="border-b border-border px-5 py-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Margin
          </div>
          {marginDollars !== null ? (
            <>
              <div
                className={cn(
                  "mt-1 font-mono text-[28px] leading-none tabular-nums",
                  marginDollars > 0 && "text-success",
                  marginDollars < 0 && "text-destructive",
                  marginDollars === 0 && "text-muted-foreground",
                )}
              >
                {marginDollars >= 0 ? "+" : ""}
                {fmtCurrency(marginDollars)}
              </div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                {fmtCurrency(apply)} agreed · {fmtCurrency(list)} loadboard
                {marginPct !== null
                  ? ` · ${marginPct >= 0 ? "+" : ""}${marginPct.toFixed(1)}%`
                  : null}
              </div>
            </>
          ) : (
            <div className="mt-1 font-mono text-sm text-muted-foreground">
              No list rate available
            </div>
          )}
        </div>

        <div className="border-b border-border px-5 py-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Load · {booking.load?.load_id ?? "—"}
          </div>
          <div className="mt-1 text-sm">{fullLane(booking)}</div>
          <div className="mt-2 grid grid-cols-3 gap-3 font-mono text-[11px]">
            <div>
              <div className="text-muted-foreground/70">EQUIP</div>
              <div>{booking.load?.equipment_type ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground/70">MILES</div>
              <div>{booking.load?.miles ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground/70">PIECES</div>
              <div>{booking.load?.num_of_pieces ?? "—"}</div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Call signals
          </div>
          <div className="mt-2 space-y-1.5 font-mono text-[11px]">
            <Row label="Outcome" value={booking.call?.call_outcome ?? "—"} />
            <Row label="Sentiment" value={booking.call?.sentiment ?? "—"} />
            <Row
              label="CHS"
              value={
                chs !== null ? (
                  <span
                    className={cn(
                      chs < CHS_PASS && "text-destructive",
                      chs >= CHS_PASS && chs < CHS_EXEMPLARY && "text-warning",
                      chs >= CHS_EXEMPLARY && "text-success",
                    )}
                  >
                    {chs}/100
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <Row
              label="Duration"
              value={duration !== null ? `${Math.round(duration)}s` : "—"}
            />
            <Row label="Booked at" value={booking.booked_at.replace("T", " ").slice(0, 16)} />
          </div>

          {state === "rejected" && entry?.reason ? (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-destructive">
                Reject reason
              </div>
              <div className="mt-0.5 text-destructive">{entry.reason}</div>
            </div>
          ) : null}

          <Link
            href={`/dashboard/calls/${booking.call_id}`}
            className={cn(
              "mt-4 flex items-center justify-between rounded-md border border-border",
              "bg-background/40 px-3 py-2 text-xs transition-colors",
              "hover:border-foreground/30 hover:bg-background",
            )}
          >
            <span className="text-muted-foreground">View call details</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
          </Link>
        </div>

        <div className="border-t border-border bg-background/40 px-5 py-3">
          {rejectMode ? (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Reject reason
              </div>
              <select
                value={reasonChoice}
                onChange={(e) => setReasonChoice(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                {REJECT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {reasonChoice === "Other" ? (
                <input
                  type="text"
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder="Free-text reason"
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  autoFocus
                />
              ) : null}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setRejectMode(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  onClick={handleSubmitReject}
                  disabled={reasonChoice === "Other" && !reasonText.trim()}
                >
                  Confirm reject
                </Button>
              </div>
            </div>
          ) : state === "pending" ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setRejectMode(true)}
              >
                Reject
              </Button>
              <Button
                type="button"
                size="sm"
                className="flex-1 bg-success text-success-foreground hover:bg-success/90"
                onClick={onApprove}
              >
                Approve
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-muted-foreground">
                {state === "approved" ? "Approved" : "Rejected"}
                {entry?.at
                  ? ` · ${new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : null}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onReset}>
                Move back to pending
              </Button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground/70">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function StatePill({ state }: { state: PipelineState }) {
  const map: Record<PipelineState, { label: string; cls: string }> = {
    pending: {
      label: "Pending",
      cls: "border-success/40 text-success bg-success/10",
    },
    approved: {
      label: "Approved",
      cls: "border-border text-muted-foreground",
    },
    rejected: {
      label: "Rejected",
      cls: "border-destructive/40 text-destructive bg-destructive/10",
    },
  };
  const { label, cls } = map[state];
  return (
    <span
      className={cn(
        "rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
        cls,
      )}
    >
      {label}
    </span>
  );
}
