// Design-system-locked wordmark: both words share ink color and only the
// interpunct carries the DOT-orange accent. Do not move the accent onto the
// words or alter the two-tone rule without product approval.
export function Wordmark(): React.JSX.Element {
  return (
    <div
      aria-label="Acme Logistics"
      className="inline-flex select-none items-center gap-2.5 text-[13px] font-bold uppercase tracking-[0.22em] text-foreground"
    >
      <span>ACME</span>
      <span className="-translate-y-px text-[18px] leading-none text-[#F97316]">·</span>
      <span>LOGISTICS</span>
    </div>
  );
}
