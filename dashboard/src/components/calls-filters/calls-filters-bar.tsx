"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { AdvancedQueryBuilder } from "./advanced-query-builder";
import { MultiSelectDropdown } from "./multiselect-dropdown";
import {
  OUTCOME_VALUES,
  SENTIMENT_VALUES,
  useCallsFilters,
  type OutcomeValue,
  type SentimentValue,
} from "./use-calls-filters";

export function CallsFiltersBar({
  shownCount,
  totalCount,
  className,
}: {
  shownCount: number;
  totalCount: number;
  className?: string;
}) {
  const {
    filters,
    advancedQuery,
    hasAnyFilter,
    setFilters,
    setAdvancedQuery,
    clearAll,
  } = useCallsFilters();

  const [mcLocal, setMcLocal] = React.useState(filters.mc);

  React.useEffect(() => {
    setMcLocal(filters.mc);
  }, [filters.mc]);

  // 200ms debounce keeps the URL-synced filter store from churning on every
  // keystroke — typing "12345" would otherwise trigger five table refetches.
  React.useEffect(() => {
    if (mcLocal === filters.mc) return;
    const t = setTimeout(() => setFilters({ mc: mcLocal }), 200);
    return () => clearTimeout(t);
  }, [mcLocal, filters.mc, setFilters]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Outcome</span>
          <MultiSelectDropdown<OutcomeValue>
            label="Outcome"
            options={OUTCOME_VALUES}
            selected={filters.outcome}
            onChange={(next) => setFilters({ outcome: next })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Sentiment</span>
          <MultiSelectDropdown<SentimentValue>
            label="Sentiment"
            options={SENTIMENT_VALUES}
            selected={filters.sentiment}
            onChange={(next) => setFilters({ sentiment: next })}
          />
        </div>

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
      </div>

      <AdvancedQueryBuilder
        query={advancedQuery}
        onApply={(q) => setAdvancedQuery(q)}
        onClear={() => setAdvancedQuery(null)}
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing <span className="font-medium text-foreground">{shownCount}</span>{" "}
          of <span className="font-medium text-foreground">{totalCount}</span>{" "}
          {totalCount === 1 ? "call" : "calls"}
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
