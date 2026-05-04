"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

import { fuzzyScore } from "./fuzzy-score";
import { useCmdKData } from "./use-cmdk-data";

type Group = "Tabs" | "Carriers" | "Calls" | "Lanes";
const GROUPS: Group[] = ["Tabs", "Carriers", "Calls", "Lanes"];

type Row = {
  id: string;
  group: Group;
  primary: string;
  secondary?: string;
  haystack: string;
  href: string;
};

const TABS: Row[] = [
  { id: "tab-overview", group: "Tabs", primary: "Overview", secondary: "/dashboard", haystack: "overview dashboard home", href: "/dashboard" },
  { id: "tab-calls", group: "Tabs", primary: "Calls", secondary: "/dashboard/calls", haystack: "calls call log", href: "/dashboard/calls" },
  { id: "tab-carriers", group: "Tabs", primary: "Carriers", secondary: "/dashboard/carriers", haystack: "carriers mc roster", href: "/dashboard/carriers" },
  { id: "tab-sales", group: "Tabs", primary: "New Bookings", secondary: "/dashboard/sales", haystack: "sales bookings new", href: "/dashboard/sales" },
];

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime())
    ? s
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export type CmdKPaletteProps = { open: boolean; onOpenChange: (open: boolean) => void };

export function CmdKPalette({ open, onOpenChange }: CmdKPaletteProps) {
  const router = useRouter();
  const { calls, carriers } = useCmdKData(open);
  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 100ms debounce settles typing bursts before re-ranking the carrier+call superset; lower thrashes, higher feels laggy.
  useEffect(() => {
    const t = setTimeout(() => setQuery(raw), 100);
    return () => clearTimeout(t);
  }, [raw]);

  useEffect(() => {
    if (!open) return;
    setRaw("");
    setQuery("");
    setActiveIdx(0);
    queueMicrotask(() => inputRef.current?.focus());
  }, [open]);

  const all: Row[] = useMemo(() => {
    const carrierRows: Row[] = carriers.map((c) => ({
      id: `carrier-${c.mc_number ?? c.carrier_name ?? "x"}`,
      group: "Carriers",
      primary: `MC${c.mc_number ?? ""} — ${c.carrier_name ?? "Unknown carrier"}`,
      secondary: `${c.call_count} call${c.call_count === 1 ? "" : "s"}`,
      haystack: `${c.mc_number ?? ""} ${c.carrier_name ?? ""}`,
      href: `/dashboard/carriers?mc=${encodeURIComponent(c.mc_number ?? "")}`,
    }));
    const callRows: Row[] = calls.map((c) => ({
      id: `call-${c.call_id ?? ""}`,
      group: "Calls",
      primary: `${(c.call_id ?? "").slice(0, 8)} · ${fmtDate(c.created_at)}`,
      secondary: c.call_outcome ?? "—",
      haystack: `${c.call_id ?? ""} ${c.created_at ?? ""} ${c.mc_number ?? ""}`,
      href: `/dashboard/calls/${encodeURIComponent(c.call_id ?? "")}`,
    }));
    return [...TABS, ...carrierRows, ...callRows];
  }, [calls, carriers]);

  const groups = useMemo(() => {
    const out: Record<Group, Row[]> = { Tabs: [], Carriers: [], Calls: [], Lanes: [] };
    all
      .map((r) => ({ r, s: fuzzyScore(`${r.primary} ${r.haystack}`, query) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .forEach(({ r }) => {
        if (out[r.group].length < 5) out[r.group].push(r);
      });
    return out;
  }, [all, query]);

  const flat = useMemo(() => GROUPS.flatMap((g) => groups[g]), [groups]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (activeIdx >= flat.length) setActiveIdx(Math.max(0, flat.length - 1));
  }, [flat.length, activeIdx]);

  const execute = (row: Row | undefined) => {
    if (!row) return;
    onOpenChange(false);
    router.push(row.href);
  };

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      execute(flat[activeIdx]);
    } else if (e.key === "Tab") {
      // Trap Tab inside the single-input palette; explicit close via Esc or scrim.
      e.preventDefault();
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[60] flex items-start justify-center px-4"
      style={{ paddingTop: "25vh" }}
    >
      <button
        type="button"
        aria-label="Close command palette"
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-[640px] overflow-hidden border border-border bg-popover text-popover-foreground rounded-[12px]",
          "shadow-[0_0_40px_-10px_hsl(var(--primary)),0_24px_72px_-12px_rgba(0,0,0,0.6)]",
        )}
      >
        <input
          ref={inputRef}
          type="text"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search tabs, calls, carriers, lanes…"
          aria-label="Command query"
          aria-controls="cmdk-listbox"
          className="h-12 w-full border-0 border-b border-border bg-transparent px-4 font-mono text-[16px] text-foreground placeholder:text-muted-foreground outline-none focus:outline-none focus:ring-0"
        />
        <div id="cmdk-listbox" role="listbox" className="max-h-[55vh] overflow-y-auto py-1">
          {flat.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">No matches.</div>
          ) : (
            GROUPS.filter((g) => groups[g].length > 0).map((g) => (
              <div key={g} className="py-1">
                <div className="px-4 pb-1 pt-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{g}</div>
                {groups[g].map((row) => {
                  const idx = flat.indexOf(row);
                  return (
                    <div
                      key={row.id}
                      role="option"
                      aria-selected={idx === activeIdx}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => execute(row)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm",
                        idx === activeIdx && "bg-secondary text-secondary-foreground",
                      )}
                    >
                      <span className="truncate">{row.primary}</span>
                      {row.secondary ? (
                        <span className="shrink-0 text-[11px] font-mono text-muted-foreground">{row.secondary}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-1.5 text-[10px] font-mono text-muted-foreground">
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span>{flat.length} matches</span>
        </div>
      </div>
    </div>
  );
}
