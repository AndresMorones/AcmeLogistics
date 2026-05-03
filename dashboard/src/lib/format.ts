// Whole-dollar rounding (no cents): freight rates display as "$1,250" everywhere.
// Cents would imply false precision — Twin stores rates as integers.
export function fmtCurrency(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

export function fmtNumber(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// Flips ms -> s at the 1000ms boundary so latency cards stay narrow
// ("843 ms" vs "1.2 s") on the Telemetry tab.
export function fmtMs(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return "—";
  }
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

// Forced UTC display so dashboard timestamps match the Twin storage clock and
// the chrome "All times in UTC" chip — no per-viewer TZ ambiguity.
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function fmtDateRangeLabel(from: Date, to: Date): string {
  const now = new Date();
  const endDelta = Math.abs(now.getTime() - to.getTime());
  if (endDelta > 36 * 60 * 60 * 1000) return "Custom range";

  const spanDays = Math.round((to.getTime() - from.getTime()) / 86400000);
  if (spanDays <= 1) return "Last 1 day";
  if (spanDays <= 7) return "Last 7 days";
  if (spanDays <= 31) return "Last 1 month";
  if (spanDays <= 186) return "Last 6 months";
  if (spanDays <= 366) return "Last 1 year";
  return "Custom range";
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "—";
  return s
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

// Canonical sign convention for signed deltas across the dashboard:
// positive value = saved (green), negative = overpaid (red), zero/missing = neutral.
// Single source of truth — flipping the sign here flips every consumer.
export type Tone = "positive" | "negative" | "neutral";

export function signedTone(value: number | null | undefined): Tone {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) {
    return "neutral";
  }
  return value > 0 ? "positive" : "negative";
}

export function signedToneClass(tone: Tone): string {
  if (tone === "positive") return "text-success";
  if (tone === "negative") return "text-destructive";
  return "text-muted-foreground";
}
