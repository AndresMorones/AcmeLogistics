"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { friendlyNodeLabel } from "@/lib/node-labels";
import { useFocusTrap } from "@/lib/use-focus-trap";

type ActiveCallsResponse = {
  count: number;
  runs: ActiveRun[];
  status?: "ok" | "error" | "unconfigured";
};

type ActiveRun = {
  run_id?: string | null;
  started_at?: string | null;
  duration_seconds?: number | null;
  current_node?: string | null;
  mc_number?: string | null;
};

// Pairs with the API route's 10s server cache so per-tab traffic to HR stays
// bounded regardless of how many dashboards are open; SWR omitted to keep deps lean.
const POLL_MS = 10_000;

function formatElapsed(run: ActiveRun): string {
  if (typeof run.duration_seconds === "number" && run.duration_seconds >= 0) {
    return formatSeconds(run.duration_seconds);
  }
  if (run.started_at) {
    const startedAt = Date.parse(run.started_at);
    if (!Number.isNaN(startedAt)) {
      return formatSeconds(Math.max(0, (Date.now() - startedAt) / 1000));
    }
  }
  return "—";
}

function formatSeconds(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ActiveCallsIndicator(): React.JSX.Element {
  const [data, setData] = useState<ActiveCallsResponse>({
    count: 0,
    runs: [],
    status: "ok",
  });
  const [open, setOpen] = useState(false);
  const aborter = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick(): Promise<void> {
      aborter.current?.abort();
      const ac = new AbortController();
      aborter.current = ac;
      try {
        const res = await fetch("/api/calls/active", {
          cache: "no-store",
          signal: ac.signal,
        });
        if (cancelled) return;
        if (!res.ok) {
          setData({ count: 0, runs: [], status: "error" });
          return;
        }
        const body = (await res.json()) as ActiveCallsResponse;
        if (cancelled) return;
        setData({
          count: body.count ?? 0,
          runs: Array.isArray(body.runs) ? body.runs : [],
          status: body.status ?? "ok",
        });
      } catch {
        if (cancelled) return;
        setData({ count: 0, runs: [], status: "error" });
      }
    }

    void tick();
    const interval = setInterval(() => {
      void tick();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      aborter.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const status = data.status ?? "ok";
  const isActive = status === "ok" && data.count >= 1;
  const isError = status === "error";
  const isUnconfigured = status === "unconfigured";

  const dotClass = isError
    ? "bg-amber-500"
    : isActive
      ? "bg-emerald-500"
      : "bg-muted-foreground/40";

  const pulseClass = isActive
    ? "animate-pulse motion-reduce:animate-none"
    : "";

  const label = isError
    ? "Status unknown"
    : isUnconfigured
      ? "Live status off"
      : isActive
        ? `${data.count} live`
        : "Idle";

  const titleText = isError
    ? "Live status unavailable"
    : isUnconfigured
      ? "Live status not configured"
      : isActive
        ? `${data.count} active call${data.count === 1 ? "" : "s"}`
        : "No active calls";

  const interactive = isActive;

  return (
    <>
      <button
        type="button"
        onClick={() => interactive && setOpen(true)}
        disabled={!interactive}
        title={titleText}
        aria-label={titleText}
        aria-haspopup={interactive ? "dialog" : undefined}
        aria-expanded={interactive ? open : undefined}
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-xs",
          "tabular-nums text-muted-foreground transition-colors",
          interactive
            ? "cursor-pointer hover:bg-secondary hover:text-foreground"
            : "cursor-default",
        )}
      >
        <span
          aria-hidden
          className={cn("h-2 w-2 rounded-full", dotClass, pulseClass)}
        />
        <span>{label}</span>
      </button>

      {open ? (
        <ActiveCallsPanel
          runs={data.runs}
          count={data.count}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ActiveCallsPanel({
  runs,
  count,
  onClose,
}: {
  runs: ActiveRun[];
  count: number;
  onClose: () => void;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Trap Tab inside the slide-over so keyboard users can't escape into the
  // inert page behind the scrim — required for aria-modal="true" to be honest.
  useFocusTrap(dialogRef, true);
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Active calls"
      className="fixed inset-0 z-50 flex"
    >
      {/* Scrim is a real <button> so click-to-dismiss is reachable by screen
          readers and keyboard, not just pointer users. */}
      <button
        type="button"
        aria-label="Close active calls panel"
        onClick={onClose}
        className="flex-1 bg-black/40 backdrop-blur-sm"
      />
      <aside
        className={cn(
          "flex h-full w-full max-w-sm flex-col border-l border-border bg-card shadow-xl",
          "animate-in slide-in-from-right duration-200 motion-reduce:animate-none",
        )}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none"
            />
            <h2 className="text-sm font-semibold tracking-tight">
              {count} live call{count === 1 ? "" : "s"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Close
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          {runs.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              No active runs reported.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((run, idx) => (
                <li
                  key={run.run_id ?? `run-${idx}`}
                  className="flex flex-col gap-1 px-4 py-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-foreground">
                      MC {run.mc_number ?? "—"}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatElapsed(run)}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {friendlyNodeLabel(run.current_node)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
