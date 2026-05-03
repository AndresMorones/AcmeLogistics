"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { MultiSelectDropdown } from "@/components/calls-filters/multiselect-dropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  MARGIN_DIR_VALUES,
  useCarrierFilters,
  type MarginDirValue,
} from "./use-carrier-filters";

const MARGIN_DIR_LABELS: Record<MarginDirValue, string> = {
  below_list: "Below list (margin)",
  at_list: "At list",
  above_list: "Above list (concession)",
  unknown: "Unknown",
};

export function CarrierFiltersBar({
  shownCount,
  totalCount,
  className,
}: {
  shownCount: number;
  totalCount: number;
  className?: string;
}) {
  const { filters, hasAnyFilter, setFilters, clearAll } = useCarrierFilters();

  const [mcLocal, setMcLocal] = React.useState(filters.mc);
  const [nameLocal, setNameLocal] = React.useState(filters.name);
  const [minCallsLocal, setMinCallsLocal] = React.useState(filters.minCalls);
  const [minRateLocal, setMinRateLocal] = React.useState(filters.minRate);

  React.useEffect(() => setMcLocal(filters.mc), [filters.mc]);
  React.useEffect(() => setNameLocal(filters.name), [filters.name]);
  React.useEffect(() => setMinCallsLocal(filters.minCalls), [filters.minCalls]);
  React.useEffect(() => setMinRateLocal(filters.minRate), [filters.minRate]);

  React.useEffect(() => {
    if (mcLocal === filters.mc) return;
    const t = setTimeout(() => setFilters({ mc: mcLocal }), 200);
    return () => clearTimeout(t);
  }, [mcLocal, filters.mc, setFilters]);

  React.useEffect(() => {
    if (nameLocal === filters.name) return;
    const t = setTimeout(() => setFilters({ name: nameLocal }), 200);
    return () => clearTimeout(t);
  }, [nameLocal, filters.name, setFilters]);

  React.useEffect(() => {
    if (minCallsLocal === filters.minCalls) return;
    const t = setTimeout(() => setFilters({ minCalls: minCallsLocal }), 200);
    return () => clearTimeout(t);
  }, [minCallsLocal, filters.minCalls, setFilters]);

  React.useEffect(() => {
    if (minRateLocal === filters.minRate) return;
    const t = setTimeout(() => setFilters({ minRate: minRateLocal }), 200);
    return () => clearTimeout(t);
  }, [minRateLocal, filters.minRate, setFilters]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground sm:max-w-xs">
          MC #
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={mcLocal}
              onChange={(e) => setMcLocal(e.target.value)}
              placeholder="Filter by MC number..."
              className="pl-8 pr-8"
              aria-label="Filter by MC number"
              inputMode="numeric"
            />
            {mcLocal ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
                onClick={() => setMcLocal("")}
                aria-label="Clear MC filter"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </label>

        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground sm:max-w-xs">
          Carrier name
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={nameLocal}
              onChange={(e) => setNameLocal(e.target.value)}
              placeholder="Filter by carrier name..."
              className="pl-8 pr-8"
              aria-label="Filter by carrier name"
            />
            {nameLocal ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
                onClick={() => setNameLocal("")}
                aria-label="Clear carrier name filter"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </label>

        <label className="flex w-32 flex-col gap-1 text-xs text-muted-foreground">
          Min calls
          <Input
            value={minCallsLocal}
            onChange={(e) => setMinCallsLocal(e.target.value)}
            placeholder="0"
            inputMode="numeric"
            aria-label="Minimum call count"
          />
        </label>

        <label className="flex w-32 flex-col gap-1 text-xs text-muted-foreground">
          Min booking %
          <Input
            value={minRateLocal}
            onChange={(e) => setMinRateLocal(e.target.value)}
            placeholder="0"
            inputMode="numeric"
            aria-label="Minimum booking rate percent"
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Margin direction</span>
          <MultiSelectDropdown<MarginDirValue>
            label="Margin"
            options={MARGIN_DIR_VALUES.map((v) => ({
              value: v,
              label: MARGIN_DIR_LABELS[v],
            }))}
            selected={filters.marginDir}
            onChange={(next) => setFilters({ marginDir: next })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing <span className="font-medium text-foreground">{shownCount}</span>{" "}
          of <span className="font-medium text-foreground">{totalCount}</span>{" "}
          {totalCount === 1 ? "carrier" : "carriers"}
        </span>
        {hasAnyFilter ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={clearAll}
            className="h-auto p-0 text-xs"
          >
            Clear all filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
