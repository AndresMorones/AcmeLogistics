"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useDashboardFilters } from "@/lib/use-dashboard-filters";
import { useFocusTrap } from "@/lib/use-focus-trap";

// Hard floor against epoch-zero / typo dates leaking into upstream filters; sanitizeRange snaps anything older back to the 7d default.
// Constructed in local time so DOM `<input type="date">` strings round-trip without an off-by-one TZ shift.
const MIN_DATE = new Date(2000, 0, 1);


const DAY_MS = 86400000;

function subDays(d: Date, n: number): Date {
  return new Date(d.getTime() - n * DAY_MS);
}

function subMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() - n);
  return x;
}

function subYears(d: Date, n: number): Date {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() - n);
  return x;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime();
}

function isValid(d: Date): boolean {
  return !isNaN(d.getTime());
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseISODate(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function formatLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(d);
}

type PresetKey = "1d" | "7d" | "1m" | "6m" | "1y" | "custom";

type Preset = {
  key: PresetKey;
  label: string;
  range: () => { from: Date; to: Date };
};

const PRESETS: Preset[] = [
  {
    key: "1d",
    label: "1d",
    range: () => ({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(new Date()) }),
  },
  {
    key: "7d",
    label: "7d",
    range: () => ({ from: startOfDay(subDays(new Date(), 7)), to: endOfDay(new Date()) }),
  },
  {
    key: "1m",
    label: "1m",
    range: () => ({ from: startOfDay(subMonths(new Date(), 1)), to: endOfDay(new Date()) }),
  },
  {
    key: "6m",
    label: "6m",
    range: () => ({ from: startOfDay(subMonths(new Date(), 6)), to: endOfDay(new Date()) }),
  },
  {
    key: "1y",
    label: "1y",
    range: () => ({ from: startOfDay(subYears(new Date(), 1)), to: endOfDay(new Date()) }),
  },
];

function sanitizeRange(input: { from: Date; to: Date }): { from: Date; to: Date } {
  let { from, to } = input;
  if (!isValid(from) || !isValid(to) || from < MIN_DATE || to < MIN_DATE) {
    return {
      from: startOfDay(subDays(new Date(), 7)),
      to: endOfDay(new Date()),
    };
  }
  if (isAfter(from, to)) {
    [from, to] = [to, from];
  }
  const today = endOfDay(new Date());
  if (isAfter(to, today)) to = today;
  if (isAfter(from, today)) from = startOfDay(subDays(new Date(), 7));
  return { from, to };
}

function matchPreset(from: Date, to: Date): PresetKey {
  const fromKey = toISODate(from);
  const toKey = toISODate(to);
  for (const p of PRESETS) {
    const r = p.range();
    if (toISODate(r.from) === fromKey && toISODate(r.to) === toKey) {
      return p.key;
    }
  }
  return "custom";
}

export function DateRangePicker({ className }: { className?: string }) {
  const { filters, setFilters } = useDashboardFilters();
  const [open, setOpen] = React.useState(false);
  const [localFrom, setLocalFrom] = React.useState<Date>(filters.from);
  const [localTo, setLocalTo] = React.useState<Date>(filters.to);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  // Trap Tab/Shift-Tab inside the popover so keyboard users can't fall through to the page underneath while it acts modal.
  useFocusTrap(dialogRef, open);

  const active: PresetKey = matchPreset(filters.from, filters.to);

  React.useEffect(() => {
    if (open) {
      setLocalFrom(filters.from);
      setLocalTo(filters.to);
    }
  }, [open, filters.from, filters.to]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const apply = React.useCallback(
    (next: { from: Date; to: Date }, close = true) => {
      const clean = sanitizeRange(next);
      void setFilters({ from: clean.from, to: clean.to });
      if (close) setOpen(false);
    },
    [setFilters],
  );

  const onPreset = (p: Preset) => {
    apply(p.range());
  };

  const onApply = () => {
    apply({ from: startOfDay(localFrom), to: endOfDay(localTo) });
  };

  const today = endOfDay(new Date());
  const triggerLabel = `${formatLabel(filters.from)} → ${formatLabel(filters.to)}`;

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <Button
        variant="outline"
        size="default"
        className="gap-2 px-5 text-sm font-normal"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <CalendarIcon className="size-5" />
        <span>{triggerLabel}</span>
      </Button>
      {open ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Select date range"
          className="absolute right-0 top-full mt-2 w-80 rounded-md border bg-popover text-popover-foreground shadow-lg z-50"
        >
          <div className="flex flex-wrap gap-1 p-2">
            {PRESETS.map((p) => {
              const isActive = active === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onPreset(p)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    isActive
                      ? "border-l-2 border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                  aria-pressed={isActive}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="border-t" />
          <div className="grid grid-cols-2 gap-2 p-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              From
              <input
                type="date"
                value={toISODate(localFrom)}
                onChange={(e) =>
                  setLocalFrom(parseISODate(e.target.value) ?? localFrom)
                }
                min="2000-01-01"
                max={toISODate(today)}
                className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground [color-scheme:dark]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              To
              <input
                type="date"
                value={toISODate(localTo)}
                onChange={(e) =>
                  setLocalTo(parseISODate(e.target.value) ?? localTo)
                }
                min="2000-01-01"
                max={toISODate(today)}
                className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground [color-scheme:dark]"
              />
            </label>
          </div>
          <div className="border-t p-3">
            <Button
              variant="default"
              size="sm"
              className="w-full"
              onClick={onApply}
            >
              Apply
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
