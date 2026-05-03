import type { CallRecord } from "@/types/api-types";
import { Card, CardContent } from "@/components/ui/card";
import {
  favorableSentimentPct,
  type DailySentimentBucket,
} from "@/lib/daily-buckets";
import { CHS_PASS, isFlagged } from "@/lib/chs-thresholds";

const ARC_RADIUS = 38;
const ARC_STROKE = 9;
const ARC_LEN = Math.PI * ARC_RADIUS;

// Favorable-arc colour bands deliberately mirror the CHS pass band (>=70 = pass)
// so this gauge and the flagged-CHS palette tell the same story at a glance.
// If CHS_PASS moves, retune these in lockstep.
function tone(pct: number): string {
  if (pct >= 70) return "#15803d";
  if (pct >= 50) return "#b45309";
  return "#b91c1c";
}

export function FlaggedSentimentCard({
  calls,
  dailySentiment,
}: {
  calls: CallRecord[];
  dailySentiment: DailySentimentBucket[];
}) {
  const flaggedCount = calls.reduce(
    (acc, c) => (isFlagged(c.case_health_score) ? acc + 1 : acc),
    0,
  );

  const pct = favorableSentimentPct(dailySentiment);
  const fillLen = pct === null ? 0 : (pct / 100) * ARC_LEN;
  const color = pct === null ? "#475569" : tone(pct);

  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-3 p-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            flagged
          </p>
          <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight">
            {flaggedCount}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            CHS &lt; {CHS_PASS}
          </p>
        </div>

        <div className="flex flex-col items-center justify-center">
          <p className="self-start text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Favorable
          </p>
          <svg
            width="100"
            height="60"
            viewBox="0 0 100 60"
            role="img"
            aria-label="Favorable sentiment percentage"
          >
            <path
              d={`M ${50 - ARC_RADIUS},48 A ${ARC_RADIUS},${ARC_RADIUS} 0 0 1 ${50 + ARC_RADIUS},48`}
              fill="none"
              stroke="#1f2937"
              strokeWidth={ARC_STROKE}
              strokeLinecap="round"
            />
            {pct !== null ? (
              <path
                d={`M ${50 - ARC_RADIUS},48 A ${ARC_RADIUS},${ARC_RADIUS} 0 0 1 ${50 + ARC_RADIUS},48`}
                fill="none"
                stroke={color}
                strokeWidth={ARC_STROKE}
                strokeLinecap="round"
                strokeDasharray={`${fillLen} ${ARC_LEN}`}
              />
            ) : null}
            <text
              x="50"
              y="42"
              textAnchor="middle"
              fontSize="16"
              fontWeight="700"
              fill="currentColor"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {pct === null ? "—" : `${pct}%`}
            </text>
          </svg>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            POS + N / TOTAL
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
