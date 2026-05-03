"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  parseAdvancedQueryRaw,
  serializeAdvancedQuery,
  type AdvancedQuery,
} from "./predicate-types";

export const OUTCOME_VALUES = [
  "load_booked",
  "no_match",
  "call_abandoned",
  "rate_disagreement",
  "carrier_not_qualified",
] as const;

export const SENTIMENT_VALUES = [
  "positive",
  "neutral",
  "negative",
  "frustrated",
] as const;

export type OutcomeValue = (typeof OUTCOME_VALUES)[number];
export type SentimentValue = (typeof SENTIMENT_VALUES)[number];

export type CallsFiltersState = {
  from: string;
  to: string;
  outcome: OutcomeValue[];
  sentiment: SentimentValue[];
  mc: string;
};

function parseCsv<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const set = new Set(allowed as readonly string[]);
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => set.has(s));
}

// Single source of truth for filter state is the URL — no local React state, no
// debouncing. Every mutation goes through `router.replace` (not `push`) so
// filter tweaks don't pollute history; one Back press escapes the filtered view.
// CSV-joined multi-values (`outcome=a,b,c`) over repeated keys keeps the URL
// short and the parser trivial.
export function useCallsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const fromString = params.get("from") ?? "";
  const toString = params.get("to") ?? "";
  const outcomeString = params.get("outcome") ?? "";
  const sentimentString = params.get("sentiment") ?? "";
  const mcString = params.get("mc") ?? "";
  const qString = params.get("q");

  const filters: CallsFiltersState = useMemo(
    () => ({
      from: fromString,
      to: toString,
      outcome: parseCsv(outcomeString, OUTCOME_VALUES),
      sentiment: parseCsv(sentimentString, SENTIMENT_VALUES),
      mc: mcString,
    }),
    [fromString, toString, outcomeString, sentimentString, mcString],
  );

  const advancedQuery = useMemo<AdvancedQuery | null>(
    () => parseAdvancedQueryRaw(qString),
    [qString],
  );

  const hasAnyFilter =
    !!filters.from ||
    !!filters.to ||
    filters.outcome.length > 0 ||
    filters.sentiment.length > 0 ||
    !!filters.mc ||
    !!advancedQuery;

  const setFilters = useCallback(
    (next: Partial<CallsFiltersState>) => {
      const sp = new URLSearchParams(params.toString());

      function setOrDelete(key: string, value: string | undefined) {
        if (value === undefined) return;
        if (value) sp.set(key, value);
        else sp.delete(key);
      }

      if ("from" in next) setOrDelete("from", next.from ?? "");
      if ("to" in next) setOrDelete("to", next.to ?? "");
      if ("outcome" in next) setOrDelete("outcome", (next.outcome ?? []).join(","));
      if ("sentiment" in next)
        setOrDelete("sentiment", (next.sentiment ?? []).join(","));
      if ("mc" in next) setOrDelete("mc", next.mc ?? "");

      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, params],
  );

  const setAdvancedQuery = useCallback(
    (q: AdvancedQuery | null) => {
      const sp = new URLSearchParams(params.toString());
      const encoded = q ? serializeAdvancedQuery(q) : null;
      if (encoded) sp.set("q", encoded);
      else sp.delete("q");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, params],
  );

  const clearAll = useCallback(() => {
    router.replace(pathname);
  }, [router, pathname]);

  return {
    filters,
    advancedQuery,
    hasAnyFilter,
    setFilters,
    setAdvancedQuery,
    clearAll,
  };
}
