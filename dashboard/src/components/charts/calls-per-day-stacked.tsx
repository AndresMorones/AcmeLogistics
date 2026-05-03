import type { DailyOutcomeBucket } from "@/lib/daily-buckets";
// Single source of truth for outcome color/label/stack-order — keeps this chart,
// the legend, and other outcome surfaces aligned (incl. server-side alias rollups
// so stale outcome strings still land in the correct stack segment).
import {
  OUTCOME_COLORS,
  OUTCOME_LABELS,
  OUTCOME_ORDER,
} from "@/lib/outcome-palette";

const GRID = "#1f1f24";

const MIN_SLOT_W = 36;

export function CallsPerDayStacked({
  buckets,
  height = 260,
}: {
  buckets: DailyOutcomeBucket[];
  height?: number;
}) {
  if (!buckets.length || buckets.every((b) => b.total === 0)) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
        style={{ height }}
      >
        No calls in the selected window.
      </div>
    );
  }

  const max = Math.max(...buckets.map((b) => b.total), 1);
  const padL = 40;
  const padR = 12;
  const padT = 28;
  const padB = 28;
  const baseW = 700;
  const minInnerW = buckets.length * MIN_SLOT_W;
  const W = Math.max(baseW, padL + padR + minInnerW);
  const H = height;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const slotW = innerW / buckets.length;
  const barW = Math.min(slotW * 0.62, 36);

  const yTicks = 4;
  const tickStep = max / yTicks;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W > baseW ? W : "100%"}
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label="Calls per day, stacked by outcome"
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
                {Math.round(v)}
              </text>
            </g>
          );
        })}

        {buckets.map((b, i) => {
          const cx = padL + slotW * i + slotW / 2;
          const stackTop = padT + innerH - (b.total / max) * innerH;
          let yOffset = padT + innerH;
          return (
            <g key={b.d}>
              {OUTCOME_ORDER.map((key) => {
                const n = b[key] ?? 0;
                if (n === 0) return null;
                const segH = (n / max) * innerH;
                yOffset -= segH;
                return (
                  <rect
                    key={key}
                    x={cx - barW / 2}
                    y={yOffset}
                    width={barW}
                    height={segH}
                    fill={OUTCOME_COLORS[key]}
                  >
                    <title>{`${b.label} · ${OUTCOME_LABELS[key]}: ${n}`}</title>
                  </rect>
                );
              })}
              {b.total > 0 ? (
                <text
                  x={cx}
                  y={stackTop - 8}
                  textAnchor="middle"
                  fontSize="14"
                  fontWeight="700"
                  fill="currentColor"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {b.total}
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
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {OUTCOME_ORDER.map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: OUTCOME_COLORS[key] }}
            />
            {OUTCOME_LABELS[key]}
          </span>
        ))}
      </div>
    </div>
  );
}
