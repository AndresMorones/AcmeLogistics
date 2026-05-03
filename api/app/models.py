from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


SparklinePoint = dict[str, Any]


class Load(BaseModel):
    load_id: str
    origin_city: str
    origin_state: str
    destination_city: str
    destination_state: str
    pickup_datetime: datetime
    delivery_datetime: datetime
    equipment_type: str
    loadboard_rate: float
    weight: float | None = None
    commodity_type: str | None = None
    num_of_pieces: int | None = None
    miles: int | None = None
    dimensions: str | None = None
    notes: str | None = None

    @property
    def origin(self) -> str:
        return f"{self.origin_city}, {self.origin_state}"

    @property
    def destination(self) -> str:
        return f"{self.destination_city}, {self.destination_state}"

    def to_response_dict(self) -> dict:
        d = self.model_dump(mode="json")
        d["origin"] = self.origin
        d["destination"] = self.destination
        return d


class LoadSearchRequest(BaseModel):
    origin_state: str | None = None
    destination_state: str | None = None
    equipment_type: str | None = None
    pickup_after: datetime | None = None
    max_results: int = 5


class LoadSearchResponse(BaseModel):
    matches: list[dict]
    total_in_store: int


class FunnelMetrics(BaseModel):
    total_calls: int
    by_outcome: dict[str, int]
    booking_rate_pct: float
    delta_pct_vs_prior: float | None = None
    sparkline: list[SparklinePoint] = Field(default_factory=list)


class EconomicsMetrics(BaseModel):
    # loadboard_rate = list ceiling, apply_rate = agreed (sourced from `bookings`, not calls_log).
    # Sign convention: positive effective_delta_dollars = saved (margin captured for broker), negative = overpaid.
    total_calls_with_rate: int
    avg_loadboard_rate: float | None
    avg_agreed_rate: float | None
    effective_delta_dollars: float | None
    effective_delta_pct: float | None
    total_revenue_booked: float
    delta_pct_vs_prior: float | None = None
    sparkline: list[SparklinePoint] = Field(default_factory=list)


class OperationalMetrics(BaseModel):
    # Per-load negotiation-rounds metrics dropped when calls_log went one-row-per-call; per-load detail lives in `bookings`.
    avg_duration_seconds: float | None
    fmcsa_decline_pct: float | None
    abandon_rate_pct: float | None
    no_match_pct: float | None = None
    delta_pct_vs_prior: float | None = None
    sparkline: list[SparklinePoint] = Field(default_factory=list)


class QualityMetrics(BaseModel):
    sentiment_distribution: dict[str, int]
    outcome_distribution: dict[str, int]
    chs_distribution: dict[str, int]
    avg_case_health_score: float | None
    auditor_remarks_sample: list[str]
    delta_pct_vs_prior: float | None = None
    sparkline: list[SparklinePoint] = Field(default_factory=list)


class AlertResult(BaseModel):
    name: str
    severity: Literal["info", "warn", "page"]
    value: float | None
    threshold: float | None
    fired: bool
    detail: str | None


class ObservabilityMetrics(BaseModel):
    generated_at: datetime
    alerts: list[AlertResult]
    case_health_series: list[float]
    booking_rate_series: list[float]
    audit_remark_tags: list[dict]


class CarrierRollupRow(BaseModel):
    mc_number: str | None
    carrier_name: str | None
    call_count: int
    booked_count: int
    booking_rate_pct: float
    avg_chs: float | None
    last_call_at: datetime | None
    avg_booking_margin_pct: float | None = None


class CarrierRollupMetrics(BaseModel):
    top_carriers: list[CarrierRollupRow]
    total_unique_carriers: int


class BookingCallSummary(BaseModel):
    call_outcome: str | None = None
    sentiment: str | None = None
    case_health_score: int | None = None
    duration_seconds: int | None = None


class BookingLoadSummary(BaseModel):
    load_id: str
    origin_city: str | None = None
    origin_state: str | None = None
    destination_city: str | None = None
    destination_state: str | None = None
    equipment_type: str | None = None
    loadboard_rate: float | None = None
    miles: int | None = None
    weight: float | None = None
    commodity_type: str | None = None
    num_of_pieces: int | None = None
    dimensions: str | None = None
    pickup_datetime: datetime | None = None
    delivery_datetime: datetime | None = None
    notes: str | None = None


class RecentBookingRow(BaseModel):
    booking_id: int | None = None
    booked_at: datetime | None = None
    mc_number: str | None = None
    call_id: str | None = None
    call: BookingCallSummary | None = None
    apply_rate: float | None = None
    load: BookingLoadSummary | None = None


class RecentBookingsResponse(BaseModel):
    bookings: list[RecentBookingRow]
    count: int


class AvailableLoadRow(BaseModel):
    load_id: str
    origin_city: str | None = None
    origin_state: str | None = None
    destination_city: str | None = None
    destination_state: str | None = None
    equipment_type: str | None = None
    loadboard_rate: float | None = None
    miles: int | None = None
    weight: float | None = None
    commodity_type: str | None = None
    pickup_datetime: datetime | None = None
    delivery_datetime: datetime | None = None
    notes: str | None = None


class AvailableLoadsResponse(BaseModel):
    loads: list[AvailableLoadRow]
    count: int


class TranscriptToolCall(BaseModel):
    # `ended_at` is a proxy (next event's wall-clock) — HR transcript shape lacks per-tool-end timestamps;
    # `duration_ms` is that gap. Telemetry is transcript-derived only; do not surface as ground-truth latency.
    tool_name: str | None = None
    args: Any = None
    result: Any = None
    started_at: str | None = None
    ended_at: str | None = None
    duration_ms: int | None = None


class TranscriptSummary(BaseModel):
    started_at: str | None = None
    ended_at: str | None = None
    duration_seconds: int | None = None
    turn_count: int = 0
    assistant_turn_count: int = 0
    user_turn_count: int = 0
    tool_call_count: int = 0
    tool_result_count: int = 0
    time_to_first_assistant_response_ms: int | None = None
    tool_calls: list[TranscriptToolCall] = Field(default_factory=list)
    per_turn_gaps_ms: list[int] = Field(default_factory=list)
    assistant_response_latency_ms: list[int] = Field(default_factory=list)
    agent_input_tokens: int | None = None
    agent_output_tokens: int | None = None
    tool_input_tokens: int | None = None
    tool_output_tokens: int | None = None


class TranscriptTimelineEntry(BaseModel):
    # Flatten transform: an assistant turn carrying both speech AND a tool call emits a leading
    # `assistant_message` row before the tool card so the dashboard renders the preamble bubble.
    kind: str
    timestamp: str | None = None
    content: str | None = None
    tool_name: str | None = None
    args: Any = None
    result: Any = None
    duration_ms: int | None = None


class TranscriptTimelineResponse(BaseModel):
    call_id: str
    timeline: list[TranscriptTimelineEntry]
    summary: TranscriptSummary
