// Telemetry alert thresholds. Canonical source for both rpm-tpm-chart and
// telemetry-reactive-widget — kept in sync to prevent the chart-vs-widget drift below.
//
// Pre-fix drift:
//   chart  → RPM_WARNING=100, TPM_WARNING=50_000   (treated 60 as healthy)
//   widget → RPM_CEILING=60,  TPM_CEILING=30_000   (alerted RED at 90% of 60)
// Result: chart showed GREEN at RPM 80 while widget alerted RED on the same data.
//
// Reconciled to keep BOTH concepts (warning = yellow band, ceiling = red band)
// and have the widget alert at WARNING for an earlier signal than the hard
// ceiling. Values follow the widget's previous capacity model (lower numbers
// preserve early-warning behavior already shipped) and add a CEILING above it.
export const RPM_WARNING = 60;
export const RPM_CEILING = 100;
export const TPM_WARNING = 30_000;
export const TPM_CEILING = 50_000;
