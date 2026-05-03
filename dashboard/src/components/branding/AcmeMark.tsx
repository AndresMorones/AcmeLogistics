type AcmeMarkProps = {
  className?: string;
  height?: number;
};

// Brand mark is design-system-locked: three stacked freight bars + chunky
// uppercase wordmark + DOT-orange subtitle. Do NOT swap to another concept
// without explicit product approval — the mark is referenced in submission artifacts.
export function AcmeMark({
  className,
  height = 32,
}: AcmeMarkProps): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 280 72"
      height={height}
      width={(height * 280) / 72}
      role="img"
      aria-label="Acme Logistics"
      className={className}
    >
      <rect x="6" y="22" width="44" height="6" fill="#F97316" />
      <rect x="14" y="34" width="36" height="6" fill="#E2E8F0" />
      <rect x="22" y="46" width="28" height="6" fill="#94A3B8" />
      <text
        x="64"
        y="40"
        fontFamily="var(--font-sans), 'Inter', 'Helvetica Neue', sans-serif"
        fontWeight="900"
        fontSize="22"
        letterSpacing="2"
        fill="#E2E8F0"
      >
        ACME LOGISTICS
      </text>
      <text
        x="64"
        y="58"
        fontFamily="var(--font-sans), 'Inter', sans-serif"
        fontWeight="500"
        fontSize="9"
        letterSpacing="4"
        fill="#F97316"
      >
        CARRIER OPERATIONS
      </text>
    </svg>
  );
}
