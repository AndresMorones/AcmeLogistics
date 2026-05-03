import { Card, CardContent } from "@/components/ui/card";
import { favorableSentimentPct, type DailySentimentBucket } from "@/lib/daily-buckets";

// Half-arc (180°) so ARC_LEN = π·r is the full strokeable path; fillLen below maps pct → arc
// length via dasharray. Changing ARC_RADIUS also requires updating the hardcoded 80±r path coords.
const ARC_RADIUS = 60;
const ARC_STROKE = 14;
const ARC_LEN = Math.PI * ARC_RADIUS;

// "Favorable" treats neutral as broker-friendly (positive + neutral)/total — product decision,
// not a bug; tier cutoffs match the CHS trend palette for visual consistency across the tab.
function tone(pct: number): string {
  if (pct >= 70) return "#15803d";
  if (pct >= 50) return "#b45309";
  return "#b91c1c";
}

export function FavorableSentimentGauge({
  buckets,
}: {
  buckets: DailySentimentBucket[];
}) {
  const pct = favorableSentimentPct(buckets);
  const fillLen = pct === null ? 0 : (pct / 100) * ARC_LEN;
  const color = pct === null ? "#475569" : tone(pct);

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center p-6">
        <p className="self-start text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Favorable sentiment
        </p>
        <svg width="160" height="100" viewBox="0 0 160 100" role="img">
          <path
            d={`M ${80 - ARC_RADIUS},80 A ${ARC_RADIUS},${ARC_RADIUS} 0 0 1 ${80 + ARC_RADIUS},80`}
            fill="none"
            stroke="#1f2937"
            strokeWidth={ARC_STROKE}
            strokeLinecap="round"
          />
          {pct !== null ? (
            <path
              d={`M ${80 - ARC_RADIUS},80 A ${ARC_RADIUS},${ARC_RADIUS} 0 0 1 ${80 + ARC_RADIUS},80`}
              fill="none"
              stroke={color}
              strokeWidth={ARC_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${fillLen} ${ARC_LEN}`}
            />
          ) : null}
          <text
            x="80"
            y="68"
            textAnchor="middle"
            fontSize="22"
            fontWeight="700"
            fill="currentColor"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {pct === null ? "—" : `${pct}%`}
          </text>
        </svg>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          (positive + neutral) / total
        </p>
      </CardContent>
    </Card>
  );
}
