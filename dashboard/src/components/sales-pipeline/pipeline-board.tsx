"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { fmtCurrency } from "@/lib/format";
import type { RecentBooking } from "@/types/api-types";

import { PipelineCard } from "./pipeline-card";
import { PipelineDetailPanel } from "./pipeline-detail-panel";
import {
  type PipelineEntry,
  type PipelineState,
  usePipelineState,
} from "./use-pipeline-state";

type Props = {
  bookings: RecentBooking[];
};

const APPROVED_VISIBLE_LIMIT = 6;
const REJECTED_VISIBLE_LIMIT = 6;

// "Kanban" by layout only — interaction is click-card → slide-over → Approve/Reject buttons.
// No drag-and-drop on purpose: keyboard-only operators stay first-class and there is no DnD
// library footprint. Approve/Reject state lives entirely in localStorage (see use-pipeline-state)
// — no Twin write, no HR call, no auth boundary. Wiring this to a real backend requires an auth
// review before the first network mutation lands.
export function PipelineBoard({ bookings }: Props) {
  const { hydrated, stateFor, entryFor, transition, reset, bulkApprove } =
    usePipelineState();
  const [openId, setOpenId] = React.useState<number | null>(null);

  const grouped = React.useMemo(() => {
    const pending: RecentBooking[] = [];
    const approved: RecentBooking[] = [];
    const rejected: RecentBooking[] = [];
    for (const b of bookings) {
      // Force "pending" until localStorage hydrates so SSR markup matches first client paint;
      // skipping this guard produces a hydration-mismatch warning and a column-flip flash.
      const s = hydrated ? stateFor(b.booking_id) : "pending";
      if (s === "approved") approved.push(b);
      else if (s === "rejected") rejected.push(b);
      else pending.push(b);
    }
    const byBookedAt = (a: RecentBooking, b: RecentBooking) =>
      a.booked_at < b.booked_at ? 1 : -1;
    pending.sort(byBookedAt);
    approved.sort(byBookedAt);
    rejected.sort(byBookedAt);
    return { pending, approved, rejected };
  }, [bookings, hydrated, stateFor]);

  const sumApply = (bs: RecentBooking[]) =>
    bs.reduce((acc, b) => acc + (b.apply_rate ?? 0), 0);
  const pendingTotal = sumApply(grouped.pending);
  const approvedTotal = sumApply(grouped.approved);

  const openBooking =
    openId !== null
      ? bookings.find((b) => b.booking_id === openId) ?? null
      : null;
  const openState: PipelineState = openBooking
    ? hydrated
      ? stateFor(openBooking.booking_id)
      : "pending"
    : "pending";
  const openEntry: PipelineEntry | null = openBooking
    ? entryFor(openBooking.booking_id)
    : null;

  const handleApprove = () => {
    if (openBooking) transition(openBooking.booking_id, "approved");
  };
  const handleReject = (reason: string) => {
    if (openBooking) transition(openBooking.booking_id, "rejected", reason);
  };
  const handleReset = () => {
    if (openBooking) reset(openBooking.booking_id);
  };

  const handleBulkApprovePending = () => {
    bulkApprove(grouped.pending.map((b) => b.booking_id));
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-baseline gap-4">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Bookings · today
          </span>
          <span className="font-mono text-sm tabular-nums">
            <span className="text-success">approved {fmtCurrency(approvedTotal)}</span>
            <span className="text-muted-foreground"> · </span>
            <span>pending {fmtCurrency(pendingTotal)}</span>
          </span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {bookings.length} total in window
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Column
          label="Pending"
          dotClass="bg-success"
          count={grouped.pending.length}
          actionLabel={
            grouped.pending.length > 0 ? `Approve all ${grouped.pending.length}` : null
          }
          onAction={handleBulkApprovePending}
        >
          {grouped.pending.length === 0 ? (
            <Empty>No pending bookings.</Empty>
          ) : (
            grouped.pending.map((b) => (
              <PipelineCard
                key={b.booking_id}
                booking={b}
                state="pending"
                entry={null}
                onClick={() => setOpenId(b.booking_id)}
              />
            ))
          )}
        </Column>

        <Column
          label="Approved"
          dotClass="bg-muted-foreground"
          count={grouped.approved.length}
        >
          {grouped.approved.length === 0 ? (
            <Empty>Nothing approved yet.</Empty>
          ) : (
            <>
              {grouped.approved.slice(0, APPROVED_VISIBLE_LIMIT).map((b) => (
                <PipelineCard
                  key={b.booking_id}
                  booking={b}
                  state="approved"
                  entry={entryFor(b.booking_id)}
                  onClick={() => setOpenId(b.booking_id)}
                />
              ))}
              {grouped.approved.length > APPROVED_VISIBLE_LIMIT ? (
                <Footer>
                  + {grouped.approved.length - APPROVED_VISIBLE_LIMIT} earlier
                </Footer>
              ) : null}
            </>
          )}
        </Column>

        <Column
          label="Rejected"
          dotClass="bg-destructive"
          count={grouped.rejected.length}
        >
          {grouped.rejected.length === 0 ? (
            <Empty>Nothing rejected.</Empty>
          ) : (
            <>
              {grouped.rejected.slice(0, REJECTED_VISIBLE_LIMIT).map((b) => (
                <PipelineCard
                  key={b.booking_id}
                  booking={b}
                  state="rejected"
                  entry={entryFor(b.booking_id)}
                  onClick={() => setOpenId(b.booking_id)}
                />
              ))}
              {grouped.rejected.length > REJECTED_VISIBLE_LIMIT ? (
                <Footer>
                  + {grouped.rejected.length - REJECTED_VISIBLE_LIMIT} earlier
                </Footer>
              ) : null}
            </>
          )}
        </Column>
      </div>

      <PipelineDetailPanel
        booking={openBooking}
        state={openState}
        entry={openEntry}
        onClose={() => setOpenId(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        onReset={handleReset}
      />
    </>
  );
}

function Column({
  label,
  dotClass,
  count,
  actionLabel,
  onAction,
  children,
}: {
  label: string;
  dotClass: string;
  count: number;
  actionLabel?: string | null;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("inline-block h-1.5 w-1.5", dotClass)} />
          <span className="text-[10px] uppercase tracking-widest">{label}</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {count}
          </span>
        </div>
        {actionLabel ? (
          <button
            type="button"
            onClick={onAction}
            className="rounded-sm border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:border-success/50 hover:text-success"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-card/40 px-3 py-6 text-center text-[11px] text-muted-foreground">
      {children}
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-1 text-center font-mono text-[10px] text-muted-foreground">
      {children}
    </div>
  );
}
