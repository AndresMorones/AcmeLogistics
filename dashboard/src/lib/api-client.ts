// `server-only` is the load-bearing token-leak guard: any accidental import
// from a Client Component fails the build before the Bearer can ship to a browser.
import "server-only";

import { apiBaseUrl, apiBearerToken } from "@/lib/config";
import type {
  AvailableLoadsResponse,
  CallRecord,
  CallTimelineResponse,
  CarrierProfile,
  CarrierRollupMetrics,
  EconomicsMetrics,
  EffectiveDeltaSeries,
  FunnelMetrics,
  LoadFull,
  ObservabilityMetrics,
  OperationalMetrics,
  QualityMetrics,
  RecentBookingsResponse,
  TelemetryAggregate,
} from "@/types/api-types";

const REVALIDATE_S = 300;

class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, message?: string) {
    super(message ?? `API ${status}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit & { revalidate?: number | false },
): Promise<T> {
  const url = `${apiBaseUrl}${path}`;
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  if (apiBearerToken) {
    headers.set("authorization", `Bearer ${apiBearerToken}`);
  }
  const next =
    init?.cache === "no-store"
      ? undefined
      : { revalidate: init?.revalidate ?? REVALIDATE_S };
  const res = await fetch(url, {
    ...init,
    headers,
    next,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, text);
  }
  return (await res.json()) as T;
}

export type DashboardFilters = { from?: Date; to?: Date };

const DEFAULT_WINDOW_DAYS = 7;

export function parseFilterParams(sp: {
  from?: string;
  to?: string;
}): DashboardFilters {
  const fromExplicit = parseStartBound(sp.from);
  const toExplicit = parseEndBound(sp.to);
  if (fromExplicit === undefined && toExplicit === undefined) {
    const now = new Date();
    const from = new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return { from, to: now };
  }
  return { from: fromExplicit, to: toExplicit };
}

function parseStartBound(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return new Date(
      Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 0, 0, 0, 0),
    );
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function parseEndBound(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    // End-of-day in UTC: naive `new Date("YYYY-MM-DD")` parses to 00:00Z and
    // would exclude every row created during the bound day itself.
    return new Date(
      Date.UTC(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
        23,
        59,
        59,
        999,
      ),
    );
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function withFilters(path: string, filters?: DashboardFilters): string {
  if (!filters?.from && !filters?.to) return path;
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from.toISOString());
  if (filters.to) params.set("to", filters.to.toISOString());
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${params.toString()}`;
}

// Override the 300s default: Next.js Data Cache otherwise reuses payloads
// across filter changes, freezing the dashboard when the date range moves.
const DASHBOARD_REVALIDATE = 30;

export async function getFunnel(filters?: DashboardFilters): Promise<FunnelMetrics> {
  return apiFetch<FunnelMetrics>(withFilters("/v1/dashboard/funnel", filters), {
    revalidate: DASHBOARD_REVALIDATE,
  });
}

export async function getEconomics(filters?: DashboardFilters): Promise<EconomicsMetrics> {
  return apiFetch<EconomicsMetrics>(withFilters("/v1/dashboard/economics", filters), {
    revalidate: DASHBOARD_REVALIDATE,
  });
}

export async function getOperational(filters?: DashboardFilters): Promise<OperationalMetrics> {
  return apiFetch<OperationalMetrics>(withFilters("/v1/dashboard/operational", filters), {
    revalidate: DASHBOARD_REVALIDATE,
  });
}

export async function getQuality(filters?: DashboardFilters): Promise<QualityMetrics> {
  return apiFetch<QualityMetrics>(withFilters("/v1/dashboard/quality", filters), {
    revalidate: DASHBOARD_REVALIDATE,
  });
}

export async function getObservability(filters?: DashboardFilters): Promise<ObservabilityMetrics> {
  return apiFetch<ObservabilityMetrics>(
    withFilters("/v1/dashboard/observability", filters),
    { revalidate: DASHBOARD_REVALIDATE },
  );
}

export async function getCarriers(filters?: DashboardFilters): Promise<CarrierRollupMetrics> {
  return apiFetch<CarrierRollupMetrics>(withFilters("/v1/dashboard/carriers", filters), {
    revalidate: DASHBOARD_REVALIDATE,
  });
}

export async function getEffectiveDelta(
  filters?: DashboardFilters,
): Promise<EffectiveDeltaSeries> {
  return apiFetch<EffectiveDeltaSeries>(
    withFilters("/v1/dashboard/effective-delta", filters),
    { revalidate: DASHBOARD_REVALIDATE },
  );
}

export async function getCarrierProfile(
  mc: string,
): Promise<CarrierProfile | null> {
  try {
    return await apiFetch<CarrierProfile>(
      `/v1/carriers/${encodeURIComponent(mc)}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// Twin REST returns numerics as JSON strings ("100" not 100); without coercion
// downstream `>= 70` checks type-fail silently and every row drops out.
function normalizeCallRow<T extends CallRecord>(row: T): T {
  const raw = row.case_health_score as unknown;
  if (raw === null || raw === undefined || raw === "") {
    return { ...row, case_health_score: null };
  }
  const n = Number(raw);
  return { ...row, case_health_score: Number.isNaN(n) ? null : n };
}

export type CallsListResult = {
  calls: CallRecord[];
  source: "v1-calls" | "v1-dashboard-calls" | "fallback-empty";
  error?: string;
};

export async function getCalls(
  limit = 100,
  filters?: DashboardFilters,
): Promise<CallsListResult> {
  const candidates = [
    `/v1/calls?limit=${limit}`,
    `/v1/dashboard/calls?limit=${limit}`,
  ] as const;
  for (const base of candidates) {
    const path = withFilters(base, filters);
    try {
      // `no-store` is required: the calls route is force-dynamic upstream, and
      // ISR caching here silently re-introduces the empty-on-soft-nav regression.
      const data = await apiFetch<CallRecord[] | { calls?: CallRecord[] }>(path, {
        cache: "no-store",
      });
      const raw = Array.isArray(data) ? data : (data?.calls ?? []);
      const calls = raw.map(normalizeCallRow);
      return {
        calls,
        source: base.startsWith("/v1/calls") ? "v1-calls" : "v1-dashboard-calls",
      };
    } catch (err) {
      // Structured log per failed candidate; we still try the next one.
      // UI fallback (empty calls) preserved so zero-state renders cleanly.
      console.error(
        JSON.stringify({
          event: "api_client_error",
          fn: "getCalls",
          path,
          message: err instanceof Error ? err.message : String(err),
          status: err instanceof ApiError ? err.status : undefined,
        }),
      );
    }
  }
  return { calls: [], source: "fallback-empty" };
}

export type CallBookingRow = {
  id?: number | null;
  created_at?: string | null;
  call_id?: string | null;
  mc_number?: string | null;
  load_id?: string | null;
  apply_rate?: number | null;
  load?: LoadFull | null;
};

export type CallDetailRecord = CallRecord & {
  bookings?: CallBookingRow[];
};

export async function getCallTimeline(
  callId: string,
): Promise<CallTimelineResponse | null> {
  try {
    return await apiFetch<CallTimelineResponse>(
      `/v1/calls/${encodeURIComponent(callId)}/timeline`,
      { revalidate: 60 },
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function getRecentBookings(
  filters?: DashboardFilters,
): Promise<RecentBookingsResponse> {
  try {
    return await apiFetch<RecentBookingsResponse>(
      withFilters("/v1/dashboard/bookings", filters),
      { revalidate: 30 },
    );
  } catch (err) {
    // 404/405 are expected (endpoint optional); log only true errors.
    if (!(err instanceof ApiError && (err.status === 404 || err.status === 405))) {
      console.error(
        JSON.stringify({
          event: "api_client_error",
          fn: "getRecentBookings",
          message: err instanceof Error ? err.message : String(err),
          status: err instanceof ApiError ? err.status : undefined,
        }),
      );
    }
    return { bookings: [], count: 0 };
  }
}

export async function getAvailableLoads(
  filters?: DashboardFilters,
): Promise<AvailableLoadsResponse> {
  try {
    return await apiFetch<AvailableLoadsResponse>(
      withFilters("/v1/dashboard/loads/available", filters),
    );
  } catch (err) {
    // 404/405 are expected (endpoint optional); log only true errors.
    if (!(err instanceof ApiError && (err.status === 404 || err.status === 405))) {
      console.error(
        JSON.stringify({
          event: "api_client_error",
          fn: "getAvailableLoads",
          message: err instanceof Error ? err.message : String(err),
          status: err instanceof ApiError ? err.status : undefined,
        }),
      );
    }
    return { loads: [], count: 0 };
  }
}

export type TelemetryAggregateOpts = {
  from?: Date;
  to?: Date;
  bucketMinutes?: number;
  maxRuns?: number;
};

export async function getTelemetry(
  opts?: TelemetryAggregateOpts,
): Promise<TelemetryAggregate | null> {
  const params = new URLSearchParams();
  if (opts?.from) params.set("from", opts.from.toISOString());
  if (opts?.to) params.set("to", opts.to.toISOString());
  if (opts?.bucketMinutes) params.set("bucket_minutes", String(opts.bucketMinutes));
  if (opts?.maxRuns) params.set("max_runs", String(opts.maxRuns));
  const qs = params.toString();
  const path = qs ? `/v1/dashboard/telemetry?${qs}` : "/v1/dashboard/telemetry";
  try {
    return await apiFetch<TelemetryAggregate>(path, { revalidate: 30 });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 502 || err.status === 503)) {
      return null;
    }
    throw err;
  }
}

export { ApiError };
