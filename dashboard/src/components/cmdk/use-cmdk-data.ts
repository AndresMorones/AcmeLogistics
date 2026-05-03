"use client";

import { useEffect, useState } from "react";

import type { CallRecord, CarrierRollupRow } from "@/types/api-types";

type Data = { calls: CallRecord[]; carriers: CarrierRollupRow[] };
// Module-scoped cache + inflight promise dedupe re-fetches across remounts and concurrent palette opens; staleness within a tab session is the explicit trade-off — full refresh requires a hard reload.
let CACHE: Data | null = null;
let INFLIGHT: Promise<Data> | null = null;

async function fetchAll(): Promise<Data> {
  const [callsRes, carriersRes] = await Promise.all([
    fetch("/api/cmdk/calls", { cache: "no-store" }).catch(() => null),
    fetch("/api/cmdk/carriers", { cache: "no-store" }).catch(() => null),
  ]);
  return {
    calls: callsRes?.ok ? ((await callsRes.json()).calls ?? []) : [],
    carriers: carriersRes?.ok ? ((await carriersRes.json()).rows ?? []) : [],
  };
}

export function useCmdKData(enabled: boolean): Data {
  const [state, setState] = useState<Data>(() => CACHE ?? { calls: [], carriers: [] });
  useEffect(() => {
    if (!enabled || CACHE) return;
    let cancelled = false;
    if (!INFLIGHT) INFLIGHT = fetchAll().then((r) => (CACHE = r));
    INFLIGHT.then((d) => {
      INFLIGHT = null;
      if (!cancelled) setState(d);
    }).catch(() => {
      INFLIGHT = null;
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return state;
}
