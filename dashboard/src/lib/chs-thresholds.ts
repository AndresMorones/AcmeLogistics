// CHS (Case Health Score) tier thresholds. Single source of truth.
// PASS gates the voice-agent prompt: <70 = flagged.
// HEALTHY = 85+ tier used by chs-badge, calls-table, call-kpi-cards.
// EXEMPLARY = 90+ tier used by sales-pipeline detail panel for the
//   "well above threshold" green band (kept distinct from HEALTHY=85
//   because pipeline view treats 85-89 as still warning territory).
export const CHS_PASS = 70;
export const CHS_HEALTHY = 85;
export const CHS_EXEMPLARY = 90;

export type ChsTier = "exemplary" | "healthy" | "ok" | "flagged" | "unknown";

export function chsTier(value: number | null | undefined): ChsTier {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "unknown";
  }
  if (value >= CHS_EXEMPLARY) return "exemplary";
  if (value >= CHS_HEALTHY) return "healthy";
  if (value >= CHS_PASS) return "ok";
  return "flagged";
}

// True when the score is below the PASS gate (i.e. flagged).
export function isFlagged(value: number | null | undefined): boolean {
  if (value === null || value === undefined || Number.isNaN(value)) return false;
  return value < CHS_PASS;
}
