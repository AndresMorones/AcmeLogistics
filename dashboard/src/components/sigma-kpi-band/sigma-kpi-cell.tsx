import { cn } from "@/lib/utils";

type Tone = "good" | "warn" | "bad" | null;

export type SigmaKpiCellProps = {
  label: string;
  value: string;
  bar: number;
  pos: boolean;
  bgTone?: Tone;
  hint?: string;
  isLast?: boolean;
  isMobileRowEnd?: boolean;
};

const TONE_BG: Record<Exclude<Tone, null>, string> = {
  bad: "bg-destructive/[0.14]",
  warn: "bg-warning/[0.14]",
  good: "bg-success/[0.14]",
};

// Spreadsheet-style cell: mono uppercase label on top, large tabular-nums
// value, optional hint, and an in-cell horizontal data bar at the bottom that
// reads as a sparkline rail without stealing the value's visual weight.
// Contract: `bar` is a 0..1 magnitude (clamped here defensively but callers
// must pre-clamp); `bgTone` tint is opt-in (currently CHS-only) — applying it
// elsewhere breaks the locked composite theme. `pos` flips bar color
// green/red so semantics match every metric regardless of direction.
export function SigmaKpiCell({
  label,
  value,
  bar,
  pos,
  bgTone,
  hint,
  isLast,
  isMobileRowEnd,
}: SigmaKpiCellProps): React.JSX.Element {
  const clamped = Math.max(0, Math.min(1, bar));
  const barColor = pos ? "bg-success/60" : "bg-destructive/60";
  const tintClass = bgTone ? TONE_BG[bgTone] : "";

  return (
    <div
      className={cn(
        "relative flex h-full min-h-[88px] flex-col justify-between px-3 py-2.5",
        !isLast && "border-r border-border",
        isMobileRowEnd && "sm:border-r sm:border-border",
        isMobileRowEnd && "max-sm:border-r-0",
        tintClass,
      )}
    >
      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-[26px] font-semibold leading-none tabular-nums tracking-tight">
        {value}
      </div>
      {hint && (
        <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/80">
          {hint}
        </div>
      )}
      <div className="mt-1 h-1 w-full overflow-hidden rounded-[1px] bg-border/40">
        <div
          className={cn("h-full transition-[width] duration-200", barColor)}
          style={{ width: `${(clamped * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}
