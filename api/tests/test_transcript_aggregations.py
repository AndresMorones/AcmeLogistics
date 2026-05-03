"""Tests for transcript_aggregations -- telemetry math owned by this module.

This module computes every telemetry metric on the dashboard:
  - tool error rate (with terminal-tool exclusion)
  - latency percentiles (p50/p70/p90/p99) over tool-turn gaps
  - per-tool latency rollup (with `book_load_` underscore-heal)
  - business-payload heuristic for distinguishing real responses from errors

The public surface is `aggregate_telemetry_from_transcripts`, but the actual
math lives in private helpers that this file exercises directly. We treat
these as the unit boundary because they encode the load-bearing rules.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.services import transcript_aggregations as ta


# ---------------------------------------------------------------------------
# Fixture builders
# ---------------------------------------------------------------------------
#
# `_decode_uuidv7_wall_clock` reads the first 12 hex chars of the turn id
# (dashes stripped) and treats them as a unix-ms big-endian integer. The 13th
# hex char (position 14 in the dashed UUID) must be '7' for it to be accepted
# as v7. We synthesize ids that decode to known wall-clock times so latency
# math is testable.

def _uuidv7_for_ms(unix_ms: int) -> str:
    """Build a UUIDv7-looking id whose decoded wall-clock equals ``unix_ms``."""
    hex12 = f"{unix_ms:012x}"
    # Layout: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
    # We only need the first 12 hex chars to round-trip; pad the rest.
    return f"{hex12[:8]}-{hex12[8:12]}-7000-8000-000000000000"


def _assistant_text_turn(unix_ms: int, text: str) -> dict:
    return {
        "role": "assistant",
        "id": _uuidv7_for_ms(unix_ms),
        "content": text,
    }


def _assistant_tool_call_turn(
    unix_ms: int,
    tool_name: str,
    tool_call_id: str,
    arguments: dict | None = None,
) -> dict:
    return {
        "role": "assistant",
        "id": _uuidv7_for_ms(unix_ms),
        "content": None,
        "tool_calls": [
            {
                "id": tool_call_id,
                "function": {
                    "name": tool_name,
                    "arguments": arguments or {},
                },
            }
        ],
    }


def _tool_result_turn(tool_call_id: str, name: str, result) -> dict:
    return {
        "role": "tool",
        "tool_call_id": tool_call_id,
        "name": name,
        "content": result,
    }


def _user_turn(text: str, start: int = 0, end: int = 1000) -> dict:
    return {"role": "user", "content": text, "start": start, "end": end}


def _events_from_turns(turns: list[dict]) -> list[dict]:
    """Run turns through the real parser to get the event shape the aggregator expects."""
    from app.services.transcript_parser import parse_transcript

    return parse_transcript(turns)["events"]


# ---------------------------------------------------------------------------
# Terminal-tool exclusion (R2-critical: stops error-rate inflation)
# ---------------------------------------------------------------------------


class TestTerminalToolExclusion:
    def test_hangup_missing_tool_result_is_not_counted_as_error(self):
        """`_hangup` is fire-and-forget; its missing tool_result must NOT
        count as an attempt or a failure."""
        turns = [
            _user_turn("bye"),
            _assistant_tool_call_turn(1_000, "_hangup", "tc-1"),
            # No tool_result follows -- terminal tool.
        ]
        events = _events_from_turns(turns)
        failures, attempts = ta._tool_error_count(events)
        assert attempts == 0
        assert failures == 0

    def test_transfer_call_missing_result_is_not_counted_as_error(self):
        turns = [
            _assistant_tool_call_turn(1_000, "transfer_call", "tc-1"),
        ]
        events = _events_from_turns(turns)
        failures, attempts = ta._tool_error_count(events)
        assert attempts == 0
        assert failures == 0

    def test_finalize_call_is_terminal(self):
        assert ta._is_terminal_tool("finalize_call") is True
        assert ta._is_terminal_tool("end_call") is True
        assert ta._is_terminal_tool("hangup") is True
        assert ta._is_terminal_tool("_hangup") is True
        assert ta._is_terminal_tool("transfer_call") is True

    def test_terminal_check_is_case_insensitive_and_strips(self):
        assert ta._is_terminal_tool("  HANGUP  ") is True
        assert ta._is_terminal_tool("Transfer_Call") is True

    def test_non_terminal_tool_is_not_excluded(self):
        assert ta._is_terminal_tool("query_loads") is False
        assert ta._is_terminal_tool("verify_carrier") is False
        assert ta._is_terminal_tool("book_load") is False
        assert ta._is_terminal_tool(None) is False
        assert ta._is_terminal_tool("") is False

    def test_query_loads_missing_result_IS_error(self):
        """Non-terminal tool with no tool_result counts as a failure (timeout)."""
        turns = [
            _assistant_tool_call_turn(1_000, "query_loads", "tc-1"),
            # No tool_result follows.
        ]
        events = _events_from_turns(turns)
        failures, attempts = ta._tool_error_count(events)
        assert attempts == 1
        assert failures == 1

    def test_mixed_terminal_and_real_tool_only_counts_real(self):
        turns = [
            _assistant_tool_call_turn(1_000, "query_loads", "tc-1"),
            _tool_result_turn("tc-1", "query_loads", {"rows": [{"load_id": "L1"}]}),
            _assistant_tool_call_turn(2_000, "_hangup", "tc-2"),
        ]
        events = _events_from_turns(turns)
        failures, attempts = ta._tool_error_count(events)
        assert attempts == 1
        assert failures == 0


# ---------------------------------------------------------------------------
# `book_load_` underscore-heal (HR fork drift artifact)
# ---------------------------------------------------------------------------


class TestBookLoadUnderscoreHeal:
    @pytest.mark.asyncio
    async def test_book_load_trailing_underscore_rolls_up_to_canonical_name(self):
        """A transcript emitting `book_load_` (HR drift artifact) must be
        rolled up under the canonical `book_load` key in latency_by_tool."""
        turns = [
            _assistant_tool_call_turn(1_000, "book_load_", "tc-1"),
            _tool_result_turn("tc-1", "book_load_", {"success": True, "load_id": "L1"}),
            _assistant_text_turn(2_500, "booked!"),
        ]
        row = {
            "call_id": "c1",
            "created_at": "2026-04-27T10:00:00Z",
            "transcript": turns,
        }

        with patch.object(ta, "list_calls", new=AsyncMock(return_value=[row])):
            result = await ta._aggregate_uncached(
                from_=datetime(2026, 4, 27, tzinfo=timezone.utc),
                to_=datetime(2026, 4, 28, tzinfo=timezone.utc),
                max_runs=10,
                bucket_minutes=1,
            )

        # Healed: shows up under "book_load", not "book_load_".
        assert "book_load" in result["latency_by_tool"]
        assert "book_load_" not in result["latency_by_tool"]

    @pytest.mark.asyncio
    async def test_canonical_and_underscore_variants_aggregate_together(self):
        """Two calls -- one emits `book_load`, the other `book_load_` -- and
        their samples should pool under a single `book_load` bucket."""
        call_a = {
            "call_id": "ca",
            "created_at": "2026-04-27T10:00:00Z",
            "transcript": [
                _assistant_tool_call_turn(1_000, "book_load", "tc-a"),
                _tool_result_turn("tc-a", "book_load", {"success": True}),
                _assistant_text_turn(2_000, "ok"),
            ],
        }
        call_b = {
            "call_id": "cb",
            "created_at": "2026-04-27T10:01:00Z",
            "transcript": [
                _assistant_tool_call_turn(60_000, "book_load_", "tc-b"),
                _tool_result_turn("tc-b", "book_load_", {"success": True}),
                _assistant_text_turn(63_000, "ok"),
            ],
        }
        with patch.object(ta, "list_calls", new=AsyncMock(return_value=[call_a, call_b])):
            result = await ta._aggregate_uncached(
                from_=datetime(2026, 4, 27, tzinfo=timezone.utc),
                to_=datetime(2026, 4, 28, tzinfo=timezone.utc),
                max_runs=10,
                bucket_minutes=1,
            )

        assert "book_load" in result["latency_by_tool"]
        assert "book_load_" not in result["latency_by_tool"]
        # Two samples pooled under canonical name.
        assert result["latency_by_tool"]["book_load"]["sample_count"] == 2


# ---------------------------------------------------------------------------
# Percentile math
# ---------------------------------------------------------------------------


class TestPercentiles:
    def test_p50_p70_p90_p99_on_known_input(self):
        """Linear-interpolation percentiles on [10..100] step 10."""
        latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        # Algorithm: k = (n-1) * p/100; lo=floor; result = s[lo] + (s[hi]-s[lo])*(k-lo)
        # n=10 -> n-1=9
        # p50: k=4.5 -> 50 + (60-50)*0.5 = 55
        # p70: k=6.3 -> 70 + (80-70)*0.3 = 73
        # p90: k=8.1 -> 90 + (100-90)*0.1 = 91
        # p99: k=8.91 -> 90 + (100-90)*0.91 = 99.1
        result = ta._latency_percentiles([float(x) for x in latencies])
        assert result["p50"] == pytest.approx(55.0)
        assert result["p70"] == pytest.approx(73.0)
        assert result["p90"] == pytest.approx(91.0)
        assert result["p99"] == pytest.approx(99.1)

    def test_percentiles_empty_input_returns_none_for_all(self):
        result = ta._latency_percentiles([])
        assert result == {"p50": None, "p70": None, "p90": None, "p99": None}

    def test_percentiles_single_value_returns_that_value_for_all(self):
        result = ta._latency_percentiles([42.0])
        assert result == {"p50": 42.0, "p70": 42.0, "p90": 42.0, "p99": 42.0}

    def test_percentiles_unsorted_input_is_sorted_internally(self):
        """The function must not assume sorted input."""
        a = ta._latency_percentiles([100.0, 10.0, 50.0, 20.0, 80.0])
        b = ta._latency_percentiles([10.0, 20.0, 50.0, 80.0, 100.0])
        assert a == b

    def test_percentiles_handle_int_and_float_mixed(self):
        result = ta._latency_percentiles([10, 20.0, 30, 40.0])
        # All keys present, all floats.
        assert set(result.keys()) == {"p50", "p70", "p90", "p99"}
        assert all(isinstance(v, float) for v in result.values())


# ---------------------------------------------------------------------------
# Business-payload heuristic + tool-failure detection
# ---------------------------------------------------------------------------


class TestBusinessPayloadHeuristic:
    def test_dict_with_rows_key_is_business_payload(self):
        assert ta._has_business_payload({"rows": []}) is True
        assert ta._has_business_payload({"rows": [{"load_id": "L1"}]}) is True

    def test_dict_with_load_id_or_loadboard_rate_is_business_payload(self):
        assert ta._has_business_payload({"load_id": "L1"}) is True
        assert ta._has_business_payload({"loadboard_rate": 1500}) is True

    def test_dict_with_negotiation_keys_is_business_payload(self):
        assert ta._has_business_payload({"final_floor": 1200}) is True
        assert ta._has_business_payload({"urgency_tier": "T1"}) is True

    def test_dict_with_only_unrelated_keys_is_not_business_payload(self):
        assert ta._has_business_payload({"foo": "bar"}) is False
        assert ta._has_business_payload({}) is False

    def test_query_loads_with_results_is_not_failure(self):
        assert ta._is_tool_failure({"rows": [{"load_id": "L1"}]}) is False

    def test_dict_with_error_AND_business_payload_is_not_failure(self):
        """If the result carries a real business payload, an `error` field
        alongside it must NOT flip the call to failure -- the work happened."""
        result = {"rows": [{"load_id": "L1"}], "error": "warn: cache miss"}
        assert ta._is_tool_failure(result) is False

    def test_dict_with_only_error_is_failure(self):
        assert ta._is_tool_failure({"error": "boom"}) is True

    def test_status_code_4xx_or_5xx_is_failure(self):
        assert ta._is_tool_failure({"status_code": 500}) is True
        assert ta._is_tool_failure({"status_code": 404}) is True
        assert ta._is_tool_failure({"status_code": 200}) is False
        assert ta._is_tool_failure({"status_code": 200, "rows": []}) is False

    def test_empty_string_result_is_failure(self):
        assert ta._is_tool_failure("") is True
        assert ta._is_tool_failure("   ") is True

    def test_error_string_result_is_failure(self):
        assert ta._is_tool_failure("error: timeout after 30s") is True
        assert ta._is_tool_failure("Timeout reached") is True
        assert ta._is_tool_failure('{"error": "x"}') is True

    def test_normal_string_result_is_not_failure(self):
        assert ta._is_tool_failure("ok") is False

    def test_none_result_is_failure(self):
        assert ta._is_tool_failure(None) is True

    def test_empty_dict_result_is_failure(self):
        assert ta._is_tool_failure({}) is True


# ---------------------------------------------------------------------------
# Tool-turn latency estimation
# ---------------------------------------------------------------------------


class TestToolTurnLatency:
    def test_latency_estimated_from_gap_to_next_assistant_turn(self):
        """assistant_tool_call at T=1000ms -> assistant_message at T=2500ms
        produces a 1500ms latency sample."""
        turns = [
            _assistant_tool_call_turn(1_000, "query_loads", "tc-1"),
            _tool_result_turn("tc-1", "query_loads", {"rows": []}),
            _assistant_text_turn(2_500, "found nothing"),
        ]
        events = _events_from_turns(turns)
        durations = ta._tool_call_durations_ms(events)
        assert len(durations) == 1
        name, gap = durations[0]
        assert name == "query_loads"
        assert gap == pytest.approx(1500.0)

    def test_no_next_assistant_turn_skips_sample(self):
        """If a tool call has no following assistant turn, we cannot estimate
        latency, so it must NOT produce a duration sample."""
        turns = [
            _assistant_tool_call_turn(1_000, "query_loads", "tc-1"),
            _tool_result_turn("tc-1", "query_loads", {"rows": []}),
        ]
        events = _events_from_turns(turns)
        durations = ta._tool_call_durations_ms(events)
        assert durations == []

    def test_multiple_tool_calls_each_get_own_sample(self):
        turns = [
            _assistant_tool_call_turn(1_000, "query_loads", "tc-1"),
            _tool_result_turn("tc-1", "query_loads", {"rows": []}),
            _assistant_tool_call_turn(3_000, "verify_carrier", "tc-2"),
            _tool_result_turn("tc-2", "verify_carrier", {"content": {}}),
            _assistant_text_turn(5_000, "done"),
        ]
        events = _events_from_turns(turns)
        durations = ta._tool_call_durations_ms(events)
        names = [n for n, _ in durations]
        gaps = [g for _, g in durations]
        assert names == ["query_loads", "verify_carrier"]
        # query_loads: next assistant after 1000ms is 3000ms -> 2000ms gap.
        # verify_carrier: next assistant after 3000ms is 5000ms -> 2000ms gap.
        assert gaps[0] == pytest.approx(2000.0)
        assert gaps[1] == pytest.approx(2000.0)

    def test_negative_gap_is_clamped_to_zero(self):
        """Defensive: if wall-clocks are out-of-order (clock skew), gap is
        clamped to >= 0 rather than producing a negative latency."""
        # Build by hand to skip the parser's natural ordering.
        events = [
            {
                "index": 0,
                "kind": "assistant_tool_call",
                "wall_clock": "1970-01-01T00:00:02.000Z",  # 2000ms
                "tool_calls": [{"id": "tc-1", "name": "query_loads"}],
            },
            {
                "index": 1,
                "kind": "assistant_message",
                "wall_clock": "1970-01-01T00:00:01.000Z",  # 1000ms (earlier!)
            },
        ]
        durations = ta._tool_call_durations_ms(events)
        assert len(durations) == 1
        _, gap = durations[0]
        assert gap == 0.0


# ---------------------------------------------------------------------------
# Transcript coercion (string vs list, malformed)
# ---------------------------------------------------------------------------


class TestTranscriptCoercion:
    def test_list_passes_through(self):
        x = [{"role": "user", "content": "hi"}]
        assert ta._coerce_transcript(x) is x

    def test_json_string_decodes(self):
        result = ta._coerce_transcript('[{"role": "user"}]')
        assert result == [{"role": "user"}]

    def test_malformed_string_returns_none(self):
        assert ta._coerce_transcript("not-json{{") is None

    def test_empty_string_returns_none(self):
        assert ta._coerce_transcript("") is None
        assert ta._coerce_transcript("   ") is None

    def test_non_list_json_returns_none(self):
        assert ta._coerce_transcript('{"role": "user"}') is None

    def test_none_returns_none(self):
        assert ta._coerce_transcript(None) is None
