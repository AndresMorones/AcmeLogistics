import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHS_HEALTHY, CHS_PASS } from "@/lib/chs-thresholds";

export type ChsTrendPoint = {
  d: string;
  v: number | null;
};

const COLOR = {
  muted: "#8A93A3",
  forest: "#15803d",
  amber: "#b45309",
  brick: "#b91c1c",
} as const;

function tierColor(v: number): string {
  if (v >= CHS_HEALTHY) return COLOR.forest;
  if (v >= CHS_PASS) return COLOR.amber;
  return COLOR.brick;
}

function movingAvg7(xs: Array<number | null>): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < xs.length; i++) {
    const window: number[] = [];
    for (let j = Math.max(0, i - 6); j <= i; j++) {
      const v = xs[j];
      if (typeof v === "number" && !Number.isNaN(v)) window.push(v);
    }
    out.push(window.length ? window.reduce((a, b) => a + b, 0) / window.length : null);
  }
  return out;
}

function movingStd7(xs: Array<number | null>): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < xs.length; i++) {
    const window: number[] = [];
    for (let j = Math.max(0, i - 6); j <= i; j++) {
      const v = xs[j];
      if (typeof v === "number" && !Number.isNaN(v)) window.push(v);
    }
    if (!window.length) {
      out.push(null);
      continue;
    }
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length;
    out.push(Math.sqrt(variance));
  }
  return out;
}

function smoothPath(points: Array<{ x: number; y: number } | null>): string {
  let d = "";
  let prev: { x: number; y: number } | null = null;
  let preprev: { x: number; y: number } | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p) {
      prev = null;
      preprev = null;
      continue;
    }
    if (!prev) {
      d += `${d ? " " : ""}M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    } else {
      const next = points[i + 1] ?? p;
      const p0 = preprev ?? prev;
      const p1 = prev;
      const p2 = p;
      const p3 = next;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    preprev = prev;
    prev = p;
  }
  return d;
}

export function ChsTrendChart({
  series,
  height = 240,
}: {
  series: ChsTrendPoint[];
  height?: number;
}) {
  const N = series.length;
  const hasData = series.some((p) => p.v !== null && p.v !== undefined);

  if (!hasData || N === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Quality score trend Avg</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
            style={{ height }}
          >
            No quality data in the selected window.
          </div>
        </CardContent>
      </Card>
    );
  }

  const W = 700;
  const H = height;
  const M = { top: 18, right: 48, bottom: 36, left: 56 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const xAt = (i: number) => M.left + (innerW * i) / Math.max(1, N - 1);
  const yAt = (v: number) => M.top + innerH * (1 - v / 100);

  // Window is whatever the parent date filter sends via `series`; threshold lines below come
  // from chs-thresholds. Non-positive values are coerced to null — zero CHS treated as missing,
  // not a real score, so it drops from MA, std-dev band, and scatter alike.
  const values: Array<number | null> = series.map((p) =>
    typeof p.v === "number" && p.v > 0 ? p.v : null,
  );
  const ma = movingAvg7(values);
  const sd = movingStd7(values);

  const upper = ma.map((m, i) =>
    m === null || sd[i] === null
      ? null
      : { x: xAt(i), y: yAt(Math.min(100, m + (sd[i] as number))) },
  );
  const lower = ma.map((m, i) =>
    m === null || sd[i] === null
      ? null
      : { x: xAt(i), y: yAt(Math.max(0, m - (sd[i] as number))) },
  );

  function buildBandPath(): string {
    const upperPts = upper.filter((p): p is { x: number; y: number } => p !== null);
    const lowerPts = lower.filter((p): p is { x: number; y: number } => p !== null);
    if (upperPts.length < 2 || lowerPts.length < 2) return "";
    const upPath = smoothPath(upperPts);
    const downPath = smoothPath(lowerPts.slice().reverse());
    const downAsLines = downPath.replace(/^M /, "L ");
    return `${upPath} ${downAsLines} Z`;
  }

  const bandD = buildBandPath();
  const maPoints = ma.map((m, i) => (m === null ? null : { x: xAt(i), y: yAt(m) }));
  const maD = smoothPath(maPoints);

  const tickStride = Math.max(1, Math.ceil(N / 7));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Quality score trend Avg</CardTitle>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Daily mean Quality Score with 7-day moving average and ±1 std-dev band"
        >
          {Array.from({ length: 11 }).map((_, k) => {
            const v = k * 10;
            const y = yAt(v);
            return (
              <line
                key={`gh-${k}`}
                x1={M.left}
                x2={M.left + innerW}
                y1={y}
                y2={y}
                stroke={COLOR.amber}
                strokeOpacity={0.08}
                strokeWidth={1}
              />
            );
          })}
          {series.map((_, i) => (
            <line
              key={`gv-${i}`}
              x1={xAt(i)}
              x2={xAt(i)}
              y1={M.top}
              y2={M.top + innerH}
              stroke={COLOR.amber}
              strokeOpacity={0.05}
              strokeWidth={1}
            />
          ))}

          {bandD ? (
            <path d={bandD} fill={COLOR.forest} fillOpacity={0.06} stroke="none" />
          ) : null}

          {maD ? (
            <path
              d={maD}
              fill="none"
              stroke={COLOR.forest}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          <line
            x1={M.left}
            x2={M.left + innerW}
            y1={yAt(CHS_PASS)}
            y2={yAt(CHS_PASS)}
            stroke={COLOR.amber}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <line
            x1={M.left}
            x2={M.left + innerW}
            y1={yAt(CHS_HEALTHY)}
            y2={yAt(CHS_HEALTHY)}
            stroke={COLOR.forest}
            strokeWidth={1}
            strokeDasharray="3 3"
          />

          <text
            x={M.left + innerW + 6}
            y={yAt(CHS_PASS) + 6}
            fontSize={12}
            fill={COLOR.amber}
            style={{ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", letterSpacing: "0.06em" }}
          >
            {CHS_PASS}
          </text>
          <text
            x={M.left + innerW + 6}
            y={yAt(CHS_HEALTHY) + 6}
            fontSize={12}
            fill={COLOR.forest}
            style={{ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", letterSpacing: "0.06em" }}
          >
            {CHS_HEALTHY}
          </text>

          {series.map((p, i) =>
            typeof p.v === "number" && p.v > 0 ? (
              <circle
                key={p.d ?? i}
                cx={xAt(i)}
                cy={yAt(p.v)}
                r={5.2}
                fill={tierColor(p.v)}
                stroke="none"
              />
            ) : null,
          )}

          {[0, 25, 50, 75, 100].map((v) => (
            <text
              key={v}
              x={M.left - 8}
              y={yAt(v) + 6}
              textAnchor="end"
              fontSize={12}
              fill={COLOR.muted}
              style={{ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", letterSpacing: "0.06em" }}
            >
              {v}
            </text>
          ))}

          {series.map((p, i) => {
            if (i % tickStride !== 0 && i !== N - 1) return null;
            const dt = new Date(p.d);
            const label = Number.isNaN(dt.getTime())
              ? p.d
              : dt.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                });
            return (
              <text
                key={`x-${i}`}
                x={xAt(i)}
                y={H - 6}
                textAnchor="middle"
                fontSize={12}
                fill={COLOR.muted}
                style={{
                  fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {label}
              </text>
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}
