import type { CallRecord } from "@/types/api-types";

export type Granularity = "day" | "week" | "month";

export type DailyOutcomeBucket = {
  d: string;
  label: string;
  load_booked: number;
  no_match: number;
  carrier_not_qualified: number;
  call_abandoned: number;
  total: number;
};

export type DailyBookingRatePoint = {
  d: string;
  rate_pct: number | null;
  n: number;
};

export type DailySentimentBucket = {
  d: string;
  label: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Adaptive granularity keeps the x-axis readable across the date-picker
// presets: <=21d = day, 22-180d = ISO week (Mon-anchored, Thursday rule),
// >180d = month. All bucketing math is UTC end-to-end so server SQL window,
// browser, and Twin storage align byte-for-byte across DST seams.
export function bucketGranularity(
  from: Date | undefined,
  to: Date | undefined,
): Granularity {
  if (!from || !to) return "day";
  const days = Math.max(0, (to.getTime() - from.getTime()) / MS_PER_DAY);
  if (days <= 21) return "day";
  if (days <= 180) return "week";
  return "month";
}

function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function startOfIsoWeekUTC(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

function isoWeekKey(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow + 3);
  const isoYear = x.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const yearStartDow = (yearStart.getUTCDay() + 6) % 7;
  const week1Thu = new Date(yearStart);
  week1Thu.setUTCDate(yearStart.getUTCDate() + ((3 - yearStartDow + 7) % 7));
  const weekNo =
    1 + Math.round((x.getTime() - week1Thu.getTime()) / (7 * MS_PER_DAY));
  return `${isoYear}-W${String(weekNo).padStart(2, "0")}`;
}

function bucketKey(d: Date, g: Granularity): string {
  if (g === "day") return dayKey(d);
  if (g === "week") return isoWeekKey(d);
  return monthKey(d);
}

function md(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function bucketLabel(d: Date, g: Granularity): string {
  if (g === "day") return md(d);
  if (g === "week") {
    const mon = startOfIsoWeekUTC(d);
    const sun = new Date(mon);
    sun.setUTCDate(mon.getUTCDate() + 6);
    return `${md(mon)} - ${md(sun)}`;
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function parseISO(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function* iterateBuckets(
  from: Date,
  to: Date,
  g: Granularity,
): Generator<{ key: string; label: string }> {
  let cursor: Date;
  if (g === "day") {
    cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  } else if (g === "week") {
    cursor = startOfIsoWeekUTC(from);
  } else {
    cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  }

  while (cursor.getTime() <= to.getTime()) {
    yield { key: bucketKey(cursor, g), label: bucketLabel(cursor, g) };
    if (g === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (g === "week") cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
}

function buildBucketAxis(
  g: Granularity,
  from: Date | undefined,
  to: Date | undefined,
  seenDates: Date[],
): { key: string; label: string }[] {
  let lo: Date;
  let hi: Date;
  if (from && to) {
    lo = from;
    hi = to;
  } else if (seenDates.length > 0) {
    const sorted = [...seenDates].sort((a, b) => a.getTime() - b.getTime());
    lo = sorted[0];
    hi = sorted[sorted.length - 1];
    const minSpan = 13 * MS_PER_DAY;
    if (hi.getTime() - lo.getTime() < minSpan) {
      lo = new Date(hi.getTime() - minSpan);
    }
  } else {
    return [];
  }
  return [...iterateBuckets(lo, hi, g)];
}

export function bucketByOutcome(
  calls: CallRecord[],
  granularity: Granularity = "day",
  from?: Date,
  to?: Date,
): DailyOutcomeBucket[] {
  const map = new Map<string, DailyOutcomeBucket>();
  const seen: Date[] = [];
  for (const c of calls) {
    const dt = parseISO(c.created_at);
    if (!dt) continue;
    seen.push(dt);
    const key = bucketKey(dt, granularity);
    let b = map.get(key);
    if (!b) {
      b = {
        d: key,
        label: bucketLabel(dt, granularity),
        load_booked: 0,
        no_match: 0,
        carrier_not_qualified: 0,
        call_abandoned: 0,
        total: 0,
      };
      map.set(key, b);
    }
    const o = c.call_outcome;
    // Twin returns either canonical or colloquial outcome strings; without
    // alias collapse, b.total ticks but the segment renders empty (phantom-bar bug).
    if (o === "load_booked" || o === "booked") b.load_booked += 1;
    else if (o === "no_match") b.no_match += 1;
    else if (
      o === "carrier_not_qualified" ||
      o === "fmcsa_declined" ||
      o === "not_qualified"
    )
      b.carrier_not_qualified += 1;
    else if (o === "call_abandoned" || o === "abandoned") b.call_abandoned += 1;
    b.total += 1;
  }

  const axis = buildBucketAxis(granularity, from, to, seen);
  if (!axis.length) return [];
  // Walk the full window so empty days render as zero bars (continuous axis);
  // overwrite the label so empty/non-empty buckets share identical x-tick text.
  return axis.map(({ key, label }) => {
    const existing = map.get(key);
    if (existing) {
      existing.label = label;
      return existing;
    }
    return {
      d: key,
      label,
      load_booked: 0,
      no_match: 0,
      carrier_not_qualified: 0,
      call_abandoned: 0,
      total: 0,
    };
  });
}

export function bookingRateSeries(
  buckets: DailyOutcomeBucket[],
): DailyBookingRatePoint[] {
  return buckets.map((b) => ({
    d: b.d,
    n: b.total,
    rate_pct: b.total > 0 ? Math.round((b.load_booked / b.total) * 1000) / 10 : null,
  }));
}

export function bucketBySentiment(
  calls: CallRecord[],
  granularity: Granularity = "day",
  from?: Date,
  to?: Date,
): DailySentimentBucket[] {
  const map = new Map<string, DailySentimentBucket>();
  const seen: Date[] = [];
  for (const c of calls) {
    const dt = parseISO(c.created_at);
    if (!dt) continue;
    seen.push(dt);
    const key = bucketKey(dt, granularity);
    let b = map.get(key);
    if (!b) {
      b = {
        d: key,
        label: bucketLabel(dt, granularity),
        positive: 0,
        neutral: 0,
        negative: 0,
        total: 0,
      };
      map.set(key, b);
    }
    const s = (c.sentiment ?? "").toLowerCase();
    if (s === "positive") b.positive += 1;
    else if (s === "neutral") b.neutral += 1;
    else if (s === "negative") b.negative += 1;
    if (s) b.total += 1;
  }

  const axis = buildBucketAxis(granularity, from, to, seen);
  if (!axis.length) return [];
  return axis.map(({ key, label }) => {
    const existing = map.get(key);
    if (existing) {
      existing.label = label;
      return existing;
    }
    return {
      d: key,
      label,
      positive: 0,
      neutral: 0,
      negative: 0,
      total: 0,
    };
  });
}

export function favorableSentimentPct(buckets: DailySentimentBucket[]): number | null {
  let pos = 0;
  let neu = 0;
  let total = 0;
  for (const b of buckets) {
    pos += b.positive;
    neu += b.neutral;
    total += b.total;
  }
  if (!total) return null;
  return Math.round(((pos + neu) / total) * 1000) / 10;
}
