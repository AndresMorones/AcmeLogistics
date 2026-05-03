"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const MARGIN_DIR_VALUES = [
  "below_list",
  "at_list",
  "above_list",
  "unknown",
] as const;

export type MarginDirValue = (typeof MARGIN_DIR_VALUES)[number];

export type CarrierFiltersState = {
  mc: string;
  name: string;
  minCalls: string;
  minRate: string;
  marginDir: MarginDirValue[];
};

function parseCsv<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const set = new Set(allowed as readonly string[]);
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => set.has(s));
}

export function useCarrierFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const mcString = params.get("mc") ?? "";
  const nameString = params.get("name") ?? "";
  const minCallsString = params.get("min_calls") ?? "";
  const minRateString = params.get("min_rate") ?? "";
  const marginDirString = params.get("margin_dir") ?? "";

  const filters: CarrierFiltersState = useMemo(
    () => ({
      mc: mcString,
      name: nameString,
      minCalls: minCallsString,
      minRate: minRateString,
      marginDir: parseCsv(marginDirString, MARGIN_DIR_VALUES),
    }),
    [mcString, nameString, minCallsString, minRateString, marginDirString],
  );

  const hasAnyFilter =
    !!filters.mc ||
    !!filters.name ||
    !!filters.minCalls ||
    !!filters.minRate ||
    filters.marginDir.length > 0;

  const setFilters = useCallback(
    (next: Partial<CarrierFiltersState>) => {
      const sp = new URLSearchParams(params.toString());

      function setOrDelete(key: string, value: string | undefined) {
        if (value === undefined) return;
        if (value) sp.set(key, value);
        else sp.delete(key);
      }

      if ("mc" in next) setOrDelete("mc", next.mc ?? "");
      if ("name" in next) setOrDelete("name", next.name ?? "");
      if ("minCalls" in next) setOrDelete("min_calls", next.minCalls ?? "");
      if ("minRate" in next) setOrDelete("min_rate", next.minRate ?? "");
      if ("marginDir" in next)
        setOrDelete("margin_dir", (next.marginDir ?? []).join(","));

      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, params],
  );

  // Owns only the carrier-filter params. Date-range params (`from`/`to`) are
  // owned by the global date picker — do not delete them here or the user's
  // selected window resets every time they clear a name/MC filter.
  const clearAll = useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("mc");
    sp.delete("name");
    sp.delete("min_calls");
    sp.delete("min_rate");
    sp.delete("margin_dir");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname, params]);

  return {
    filters,
    hasAnyFilter,
    setFilters,
    clearAll,
  };
}
