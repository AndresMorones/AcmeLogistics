"use client";

import * as React from "react";

// Browser-local pipeline state: no backend write, keyed by booking id.
// Absence-of-entry IS the `pending` state — preserve that invariant if you swap
// storage backends, or every untouched booking will silently flip category.
const STORAGE_KEY = "robot.sales.pipeline.v1";

export type PipelineState = "pending" | "approved" | "rejected";

export type PipelineEntry = {
  state: PipelineState;
  reason?: string | null;
  at: string;
};

export type PipelineMap = Record<string, PipelineEntry>;

function readStorage(): PipelineMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(map: PipelineMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
  }
}

export function usePipelineState() {
  const [map, setMap] = React.useState<PipelineMap>({});
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setMap(readStorage());
    setHydrated(true);
  }, []);

  const stateFor = React.useCallback(
    (id: number | string): PipelineState => {
      const e = map[String(id)];
      return e?.state ?? "pending";
    },
    [map],
  );

  const entryFor = React.useCallback(
    (id: number | string): PipelineEntry | null => map[String(id)] ?? null,
    [map],
  );

  const transition = React.useCallback(
    (id: number | string, state: PipelineState, reason?: string | null) => {
      setMap((prev) => {
        const next: PipelineMap = {
          ...prev,
          [String(id)]: {
            state,
            reason: state === "rejected" ? reason ?? null : null,
            at: new Date().toISOString(),
          },
        };
        writeStorage(next);
        return next;
      });
    },
    [],
  );

  const reset = React.useCallback((id: number | string) => {
    setMap((prev) => {
      const next = { ...prev };
      delete next[String(id)];
      writeStorage(next);
      return next;
    });
  }, []);

  const bulkApprove = React.useCallback((ids: Array<number | string>) => {
    setMap((prev) => {
      const next = { ...prev };
      const now = new Date().toISOString();
      for (const id of ids) {
        next[String(id)] = { state: "approved", reason: null, at: now };
      }
      writeStorage(next);
      return next;
    });
  }, []);

  return { hydrated, stateFor, entryFor, transition, reset, bulkApprove };
}
