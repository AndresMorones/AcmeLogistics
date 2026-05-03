"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ToggleGroupContextValue = {
  value: string[];
  onChange: (next: string[]) => void;
  type: "single" | "multiple";
  registerItem: (value: string, el: HTMLButtonElement | null) => void;
  itemOrder: React.MutableRefObject<string[]>;
  focusItem: (value: string, select?: boolean) => void;
};

const ToggleGroupContext = React.createContext<ToggleGroupContextValue | null>(
  null,
);

export interface ToggleGroupProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  type?: "single" | "multiple";
  value: string[];
  onChange: (next: string[]) => void;
}

export function ToggleGroup({
  type = "multiple",
  value,
  onChange,
  className,
  children,
  ...rest
}: ToggleGroupProps) {
  const itemRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());
  const itemOrder = React.useRef<string[]>([]);

  const registerItem = React.useCallback(
    (val: string, el: HTMLButtonElement | null) => {
      if (el) {
        itemRefs.current.set(val, el);
        if (!itemOrder.current.includes(val)) {
          itemOrder.current.push(val);
        }
      } else {
        itemRefs.current.delete(val);
        itemOrder.current = itemOrder.current.filter((v) => v !== val);
      }
    },
    [],
  );

  const focusItem = React.useCallback(
    (val: string, select?: boolean) => {
      const el = itemRefs.current.get(val);
      if (el) {
        el.focus();
        if (select) {
          if (type === "single") {
            onChange([val]);
          }
        }
      }
    },
    [type, onChange],
  );

  const ctxValue = React.useMemo(
    () => ({ value, onChange, type, registerItem, itemOrder, focusItem }),
    [value, onChange, type, registerItem, focusItem],
  );

  return (
    <ToggleGroupContext.Provider value={ctxValue}>
      <div
        // Hand-rolled to avoid pulling in @radix-ui/react-toggle for one widget;
        // single = radiogroup so SR users hear "1 of 3 selected" semantics.
        role={type === "single" ? "radiogroup" : "group"}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-border bg-card p-0.5 text-xs",
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    </ToggleGroupContext.Provider>
  );
}

export interface ToggleGroupItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export function ToggleGroupItem({
  value,
  className,
  children,
  onKeyDown,
  ...rest
}: ToggleGroupItemProps) {
  const ctx = React.useContext(ToggleGroupContext);
  if (!ctx) {
    throw new Error("ToggleGroupItem must be inside ToggleGroup");
  }
  const active = ctx.value.includes(value);
  const ref = React.useRef<HTMLButtonElement | null>(null);

  const setRef = React.useCallback(
    (el: HTMLButtonElement | null) => {
      ref.current = el;
      ctx.registerItem(value, el);
    },
    [ctx, value],
  );

  // Roving tabindex: active item is tab-stop; otherwise first item.
  const order = ctx.itemOrder.current;
  const firstSelected = ctx.value.find((v) => order.includes(v));
  const tabStop = firstSelected ?? order[0];
  const isTabStop = tabStop === value;

  const onClick = () => {
    if (ctx.type === "single") {
      ctx.onChange(active ? [] : [value]);
      return;
    }
    ctx.onChange(active ? ctx.value.filter((v) => v !== value) : [...ctx.value, value]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    const items = ctx.itemOrder.current;
    const idx = items.indexOf(value);
    if (idx === -1) return;
    let next: string | undefined;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = items[(idx + 1) % items.length];
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = items[(idx - 1 + items.length) % items.length];
        break;
      case "Home":
        next = items[0];
        break;
      case "End":
        next = items[items.length - 1];
        break;
      default:
        return;
    }
    if (next !== undefined) {
      e.preventDefault();
      // For radiogroup, arrow keys move focus AND selection.
      ctx.focusItem(next, ctx.type === "single");
    }
  };

  return (
    <button
      ref={setRef}
      type="button"
      role={ctx.type === "single" ? "radio" : "button"}
      // aria-checked vs aria-pressed: AT announces radio state vs toggle-button state differently;
      // mismatched attribute on the wrong role is silently ignored and breaks accessibility.
      {...(ctx.type === "single"
        ? { "aria-checked": active }
        : { "aria-pressed": active })}
      tabIndex={isTabStop ? 0 : -1}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex h-6 items-center justify-center rounded-sm px-2 text-[11px] font-medium tabular-nums transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
