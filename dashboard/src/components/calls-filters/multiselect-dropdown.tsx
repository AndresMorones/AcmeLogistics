"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/format";

export type MultiSelectOption<T extends string> = {
  value: T;
  label?: string;
};

// Hand-rolled to avoid pulling in a popover dep — exposes a true `listbox` with
// `aria-multiselectable` (not a `combobox`) since there is no text-entry filter:
// each option is a discrete toggle, not a typed search.
export function MultiSelectDropdown<T extends string>({
  label,
  options,
  selected,
  onChange,
  className,
}: {
  label: string;
  options: readonly MultiSelectOption<T>[] | readonly T[];
  selected: T[];
  onChange: (next: T[]) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

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

  const normalized: MultiSelectOption<T>[] = React.useMemo(
    () =>
      (options as readonly (MultiSelectOption<T> | T)[]).map((o) =>
        typeof o === "string" ? { value: o as T } : o,
      ),
    [options],
  );

  const selectedSet = React.useMemo(() => new Set<string>(selected), [selected]);

  function toggle(v: T) {
    const next = new Set(selectedSet);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(Array.from(next) as T[]);
  }

  const triggerLabel =
    selected.length === 0 ? label : `${label} (${selected.length})`;

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 font-normal"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{triggerLabel}</span>
        <ChevronDown className="size-4 opacity-60" />
      </Button>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 top-full mt-2 min-w-[12rem] rounded-md border bg-popover text-popover-foreground shadow-lg z-50"
        >
          <ul className="py-1">
            {normalized.map((opt) => {
              const checked = selectedSet.has(opt.value);
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(opt.value)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      checked && "text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded-sm border",
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input",
                      )}
                    >
                      {checked ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span>{opt.label ?? titleCase(opt.value)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected.length > 0 ? (
            <div className="border-t p-1.5">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded-sm px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Clear {label.toLowerCase()}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
