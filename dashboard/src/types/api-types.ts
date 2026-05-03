// Hand-mirrored from api/app/models.py (Pydantic) — that file is the source of
// truth. When the server schema changes, regenerate the openapi-typescript bundle
// at src/types/api.d.ts and reconcile the curated shapes below.
export type SparklinePoint = { d: string; v: number };

export type FunnelMetrics = {
  total_calls: number;
  by_outcome: Record<string, number>;
  booking_rate_pct: number;
  delta_pct_vs_prior?: number | null;
  sparkline?: SparklinePoint[];
};

export type EconomicsMetrics = {
  total_calls_with_rate: number;
  avg_loadboard_rate: number | null;
  avg_agreed_rate: number | null;
  effective_delta_dollars: number | null;
  effective_delta_pct: number | null;
  total_revenue_booked: number;
  delta_pct_vs_prior?: number | null;
  sparkline?: SparklinePoint[];
};

export type EffectiveDeltaPoint = {
  d: string;
  v: number | null;
  n: number;
};

export type EffectiveDeltaSeries = {
  series: EffectiveDeltaPoint[];
};

export type CarrierProfile = {
  mc_number: string;
  total_calls: number;
  total_bookings: number;
  conversion_rate: number;
  avg_apply_rate: number | null;
  last_call_at: string | null;
  sentiment_breakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  outcome_breakdown: {
    load_booked: number;
    carrier_not_qualified: number;
    call_abandoned: number;
    non_load_booking_engagement: number;
  };
};

export type OperationalMetrics = {
  avg_duration_seconds: number | null;
  fmcsa_decline_pct: number | null;
  abandon_rate_pct: number | null;
  no_match_pct: number | null;
  delta_pct_vs_prior?: number | null;
  sparkline?: SparklinePoint[];
};

export type QualityMetrics = {
  sentiment_distribution: Record<string, number>;
  outcome_distribution: Record<string, number>;
  chs_distribution: Record<string, number>;
  avg_case_health_score: number | null;
  auditor_remarks_sample: string[];
  delta_pct_vs_prior?: number | null;
  sparkline?: SparklinePoint[];
};

export type AlertResult = {
  name: string;
  severity: "info" | "warn" | "page";
  value: number | null;
  threshold: number | null;
  fired: boolean;
  detail: string | null;
};

export type ObservabilityMetrics = {
  generated_at: string;
  alerts: AlertResult[];
  case_health_series: number[];
  booking_rate_series: number[];
  audit_remark_tags: { tag: string; count: number }[];
};

export type CarrierRollupRow = {
  mc_number: string | null;
  carrier_name: string | null;
  call_count: number;
  booked_count: number;
  booking_rate_pct: number;
  avg_chs: number | null;
  last_call_at: string | null;
  avg_booking_margin_pct?: number | null;
};

export type CarrierRollupMetrics = {
  top_carriers: CarrierRollupRow[];
  total_unique_carriers: number;
};

export type CallRecord = {
  id?: number | null;
  created_at?: string | null;
  call_id?: string | null;

  mc_number?: string | null;
  carrier_name?: string | null;
  callback_phone?: string | null;
  fmcsa_eligibility_failure_reason?: string | null;

  lane_origin?: string | null;
  lane_dest?: string | null;

  call_outcome?: string | null;
  sentiment?: string | null;
  case_health_score?: number | null;
  audit_remarks?: string | null;
  notes?: string | null;

  hangup_reason?: string | null;
  room_name?: string | null;
  status?: string | null;

  transcript?: string | null;

  extract_input_tokens?: number | null;
  extract_output_tokens?: number | null;
  extract_reasoning_tokens?: number | null;
  extract_cached_input_tokens?: number | null;
  extract_uncached_input_tokens?: number | null;

  chs_input_tokens?: number | null;
  chs_output_tokens?: number | null;
  chs_reasoning_tokens?: number | null;
  chs_cached_input_tokens?: number | null;
  chs_uncached_input_tokens?: number | null;

  duration_seconds?: number | null;
  intermediate_response_count?: number | null;
  p70_latency_ms?: number | null;
  p90_latency_ms?: number | null;

  apply_rate?: number | null;
  load_id?: string | null;

  legal_name?: string | null;
};

export type LoadFull = {
  load_id?: string | null;
  origin_city?: string | null;
  origin_state?: string | null;
  destination_city?: string | null;
  destination_state?: string | null;
  equipment_type?: string | null;
  loadboard_rate?: number | null;
  miles?: number | null;
  weight?: number | null;
  commodity_type?: string | null;
  num_of_pieces?: number | null;
  dimensions?: string | null;
  pickup_datetime?: string | null;
  delivery_datetime?: string | null;
  notes?: string | null;
};

export type RecentBooking = {
  booking_id: number;
  booked_at: string;
  mc_number: string;
  call_id: string;
  call: {
    call_outcome: string | null;
    sentiment: string | null;
    case_health_score: number | null;
    duration_seconds: number | null;
  };
  apply_rate: number | null;
  load: LoadFull | null;
};

export type RecentBookingsResponse = {
  bookings: RecentBooking[];
  count: number;
};

export type AvailableLoad = LoadFull;

export type AvailableLoadsResponse = {
  loads: AvailableLoad[];
  count: number;
};

export type Sentiment = "positive" | "neutral" | "negative";
export type Outcome =
  | "load_booked"
  | "no_match"
  | "carrier_not_qualified"
  | "call_abandoned"
  | string;

export type TelemetryRpmPoint = { t: string; rpm: number };
export type TelemetryTpmPoint = { t: string; tpm: number };

export type TelemetryLatency = {
  phase: "phase1" | "phase2";
  source: "hr_rest_api" | "transcript_count" | "transcript";
  sample_count: number;
  p50_ms: number | null;
  p70_ms: number | null;
  p90_ms: number | null;
  p99_ms: number | null;
};

export type TelemetryLatencyPoint = {
  t: string;
  n: number;
  p50_ms: number | null;
  p70_ms: number | null;
  p90_ms: number | null;
  p99_ms: number | null;
};

export type TelemetryToolLatency = {
  sample_count: number;
  p50_ms: number | null;
  p70_ms: number | null;
  p90_ms: number | null;
  p99_ms: number | null;
  mean_ms: number | null;
  stddev_ms: number | null;
  series: TelemetryLatencyPoint[];
};

export type TelemetryAggregate = {
  window: { from: string; to: string; bucket_minutes: number };
  totals: {
    runs: number;
    node_samples: number;
    tool_attempts?: number;
    tool_failures?: number;
    tool_error_rate_pct?: number | null;
  };
  rpm_series: TelemetryRpmPoint[];
  tpm_series: TelemetryTpmPoint[];
  latency: TelemetryLatency;
  latency_series: TelemetryLatencyPoint[];
  latency_by_tool?: Record<string, TelemetryToolLatency>;
};

export type CallTimelineEntryKind =
  | "assistant_message"
  | "assistant_tool_call"
  | "user_message"
  | "tool_result";

export type CallTimelineEntry = {
  kind: CallTimelineEntryKind;
  timestamp: string;
  content?: string | null;
  tool_name?: string | null;
  args?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  duration_ms?: number | null;
};

export type CallTimelineToolCallSummary = {
  tool_name: string;
  duration_ms: number | null;
};

export type CallTimelineSummary = {
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  turn_count: number;
  assistant_turn_count: number;
  user_turn_count: number;
  tool_call_count: number;
  tool_result_count: number;
  time_to_first_assistant_response_ms: number | null;
  per_turn_gaps_ms: number[];
  assistant_response_latency_ms: number[];
  tool_calls: CallTimelineToolCallSummary[];
  agent_input_tokens?: number | null;
  agent_output_tokens?: number | null;
  tool_input_tokens?: number | null;
  tool_output_tokens?: number | null;
};

export type CallTimelineResponse = {
  call_id: string;
  timeline: CallTimelineEntry[];
  summary: CallTimelineSummary;
};
