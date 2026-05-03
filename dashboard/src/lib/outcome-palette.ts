// Outcome category palette. Single source for chart colors + labels +
// canonical ordering. ALIASES heals minor outcome-string variants
// emitted by upstream classifiers.
export const OUTCOME_ORDER = [
  "load_booked",
  "no_match",
  "carrier_not_qualified",
  "call_abandoned",
] as const;

export type OutcomeKey = (typeof OUTCOME_ORDER)[number];

export const OUTCOME_COLORS: Record<OutcomeKey, string> = {
  load_booked: "#15803d",
  no_match: "#1e3a8a",
  carrier_not_qualified: "#92400e",
  call_abandoned: "#4b5563",
};

export const OUTCOME_LABELS: Record<OutcomeKey, string> = {
  load_booked: "Booked",
  no_match: "No match",
  carrier_not_qualified: "Not qualified",
  call_abandoned: "Abandoned",
};

export const OUTCOME_ALIASES: Record<string, OutcomeKey> = {
  booked: "load_booked",
  abandoned: "call_abandoned",
  fmcsa_declined: "carrier_not_qualified",
  not_qualified: "carrier_not_qualified",
};
