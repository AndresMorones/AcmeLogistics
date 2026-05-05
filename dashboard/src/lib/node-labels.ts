// Translates HR-engineer node ids -> broker-facing phase labels. Multiple raw
// nodes intentionally collapse to one phrase (every `*loads*` -> "Searching loads";
// extract/score/audit/twin chain -> "Logging call") so the active-call indicator
// reads as a workflow stage, not internal vocabulary.
const NODE_LABELS: Record<string, string> = {
  inbound_voice_agent: "On call",
  prompt: "On call",
  verify_carrier: "Verifying carrier",
  query_loads: "Searching loads",
  search_loads: "Searching loads",
  search_loads_by_lane: "Searching loads",
  find_available_loads: "Searching loads",
  get_current_time: "Checking time",
  negotiate_rate: "Negotiating",
  negotiate_evaluate: "Negotiating",
  calculate_rate: "Negotiating",
  book_load: "Booking load",
  finalize_call: "Wrapping up",
  transfer_popup: "Transferring",
  ai_extract: "Logging call",
  classify_outcome: "Logging call",
  classify_sentiment: "Logging call",
  case_health_score: "Logging call",
  carrier_sales_auditor: "Logging call",
  write_to_twin: "Logging call",
};

function humanize(raw: string): string {
  const cleaned = raw.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return "In progress";
  return cleaned[0].toUpperCase() + cleaned.slice(1);
}

// Unknown nodes (newly added in HR but not yet in the map) fall back to a
// humanized raw name rather than blank or "Unknown" — degrades gracefully
// while a label entry is added.
export function friendlyNodeLabel(raw: string | null | undefined): string {
  if (!raw) return "In progress";
  const key = raw.toLowerCase().trim();
  return NODE_LABELS[key] ?? humanize(raw);
}
