import type { RecentBooking } from "@/types/api-types";
import { fmtCurrency, fmtPct } from "@/lib/format";
import { bucketGranularity, type Granularity } from "@/lib/daily-buckets";

const BAR_FILL = "#15803d";
const GHOST_STROKE = "#94a3b8";
const GRID = "#1f1f24";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type RevenueBucket = {
  key: string;
  label: string;
  actual: number;
  listed: number;
};

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
  const weekNo = 1 + Math.round((x.getTime() - week1Thu.getTime()) / (7 * MS_PER_DAY));
  return `${isoYear}-W${String(weekNo).padStart(2, "0")}`;
}

function bucketKey(d: Date, g: Granularity): string {
  if (g === "day") {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  if (g === "week") return isoWeekKey(d);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MD = (d: Date): string =>
  d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function bucketLabel(d: Date, g: Granularity): string {
  if (g === "day") return MD(d);
  if (g === "week") {
    const mon = startOfIsoWeekUTC(d);
    const sun = new Date(mon);
    sun.setUTCDate(mon.getUTCDate() + 6);
    return `${MD(mon)} - ${MD(sun)}`;
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
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

function bucket(
  bookings: RecentBooking[],
  granularity: Granularity,
  from: Date | undefined,
  to: Date | undefined,
): RevenueBucket[] {
  const map = new Map<string, RevenueBucket>();
  const seen: Date[] = [];
  for (const b of bookings) {
    if (!b.booked_at) continue;
    const dt = new Date(b.booked_at);
    if (Number.isNaN(dt.getTime())) continue;
    seen.push(dt);
    const key = bucketKey(dt, granularity);
    let cur = map.get(key);
    if (!cur) {
      cur = { key, label: bucketLabel(dt, granularity), actual: 0, listed: 0 };
      map.set(key, cur);
    }
    // Sign convention matches EconomicsMetrics.effective_delta_dollars:
    // positive (listed - actual) = booked under list = margin captured (green).
    cur.actual += b.apply_rate ?? 0;
    cur.listed += b.load?.loadboard_rate ?? 0;
  }

  let lo: Date | undefined = from;
  let hi: Date | undefined = to;
  if (!lo || !hi) {
    if (seen.length === 0) return [];
    const sorted = [...seen].sort((a, b) => a.getTime() - b.getTime());
    lo = sorted[0];
    hi = sorted[sorted.length - 1];
    const minSpan = 13 * MS_PER_DAY;
    if (hi.getTime() - lo.getTime() < minSpan) {
      lo = new Date(hi.getTime() - minSpan);
    }
  }

  const out: RevenueBucket[] = [];
  for (const { key, label } of iterateBuckets(lo, hi, granularity)) {
    const existing = map.get(key);
    out.push(
      existing
        ? { ...existing, label }
        : { key, label, actual: 0, listed: 0 },
    );
  }
  return out;
}

export function RevenueDailyChart({
  bookings,
  height = 260,
  from,
  to,
}: {
  bookings: RecentBooking[];
  height?: number;
  from?: Date;
  to?: Date;
}) {
  const granularity = bucketGranularity(from, to);
  const data = bucket(bookings, granularity, from, to);
  const totalActual = data.reduce((s, d) => s + d.actual, 0);
  const totalListed = data.reduce((s, d) => s + d.listed, 0);
  const deltaDollars = totalListed - totalActual;
  const deltaPct =
    totalListed > 0 ? (deltaDollars / totalListed) * 100 : null;

  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
        style={{ height }}
      >
        No bookings in the selected window.
      </div>
    );
  }

  const max = Math.max(
    ...data.map((d) => Math.max(d.actual, d.listed)),
    1,
  );
  const MIN_SLOT_W = 36;
  const padL = 56;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const baseW = 700;
  const minInnerW = data.length * MIN_SLOT_W;
  const W = Math.max(baseW, padL + padR + minInnerW);
  const H = height;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const slotW = innerW / data.length;
  const barW = Math.min(slotW * 0.62, 36);

  const yTicks = 4;
  const tickStep = max / yTicks;

  const fmtY = (v: number) =>
    v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${Math.round(v)}`;

  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W > baseW ? W : "100%"}
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label="Revenue per bucket, with ghost dots showing listed-rate revenue"
      >
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const v = i * tickStep;
          const y = padT + innerH - (v / max) * innerH;
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke={GRID}
                strokeDasharray="3 3"
              />
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fill="currentColor"
                opacity="0.55"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {fmtY(v)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const cx = padL + slotW * i + slotW / 2;
          const barH = (d.actual / max) * innerH;
          const ghostY = padT + innerH - (d.listed / max) * innerH;
          const fmtDp = (v: number): string => {
            if (v <= 0) return "";
            if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
            return `$${Math.round(v)}`;
          };
          return (
            <g key={d.key}>
              <rect
                x={cx - barW / 2}
                y={padT + innerH - barH}
                width={barW}
                height={barH}
                fill={BAR_FILL}
                rx="2"
              >
                <title>{`${d.label}: actual ${fmtCurrency(d.actual)} · listed ${fmtCurrency(d.listed)}`}</title>
              </rect>
              {d.listed > 0 ? (
                <circle
                  cx={cx}
                  cy={ghostY}
                  r="4"
                  fill="none"
                  stroke={GHOST_STROKE}
                  strokeWidth="1.5"
                  opacity="0.7"
                />
              ) : null}
              {d.actual > 0 ? (
                <text
                  x={cx}
                  y={padT + innerH - barH - 4}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="currentColor"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {fmtDp(d.actual)}
                </text>
              ) : null}
              <text
                x={cx}
                y={H - 10}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                opacity="0.55"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: BAR_FILL }}
            />
            Actual revenue
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border"
              style={{ borderColor: GHOST_STROKE }}
            />
            Listed rate
          </span>
        </div>
        {deltaPct !== null ? (
          <span className="tabular-nums">
            {deltaPct > 0 ? "+" : ""}
            {fmtPct(deltaPct)} vs listed ·{" "}
            <span
              className={
                deltaDollars >= 0 ? "text-success" : "text-destructive"
              }
            >
              {deltaDollars > 0 ? "+" : ""}
              {fmtCurrency(deltaDollars)}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
