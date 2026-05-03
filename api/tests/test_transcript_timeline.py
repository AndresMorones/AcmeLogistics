"""GET /v1/calls/{call_id}/timeline integration tests."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

from fastapi.testclient import TestClient


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "sample_transcript.json"


def _load_sample_transcript_str() -> str:
    """Twin stores transcripts as JSON-encoded strings — mirror that on the wire."""
    return FIXTURE_PATH.read_text(encoding="utf-8")


def _row(call_id: str, transcript: str | None) -> dict:
    return {
        "id": 1,
        "created_at": "2026-04-27T10:00:00Z",
        "call_id": call_id,
        "mc_number": "MC250819",
        "carrier_name": "GLK Trucking LLC",
        "call_outcome": "load_booked",
        "sentiment": "positive",
        "case_health_score": 92,
        "audit_remarks": None,
        "fmcsa_eligibility_failure_reason": None,
        "callback_phone": "+15555550100",
        "duration_seconds": 184,
        "transcript": transcript,
    }


def test_timeline_happy_path_shape_and_summary(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    sample = _load_sample_transcript_str()
    fake_twin.query.return_value = [_row("call-7", sample)]

    r = client.get("/v1/calls/call-7/timeline", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()

    assert body["call_id"] == "call-7"
    timeline = body["timeline"]
    assert isinstance(timeline, list)
    assert len(timeline) > 0

    kinds = {e["kind"] for e in timeline}
    assert {"assistant_message", "assistant_tool_call", "user_message", "tool_result"} <= kinds

    summary = body["summary"]
    # Sample call wraps in ~184.8s end-to-end (assistant UUIDv7-decoded);
    # accept 184 or 185 depending on int() vs round() conversion.
    assert summary["duration_seconds"] in (184, 185)
    assert summary["turn_count"] == len(timeline)
    assert summary["assistant_turn_count"] >= 1
    assert summary["user_turn_count"] >= 1
    assert summary["tool_call_count"] >= 1
    assert summary["tool_result_count"] >= 1
    # Per-turn gaps + assistant latencies populated.
    assert isinstance(summary["per_turn_gaps_ms"], list)
    assert isinstance(summary["assistant_response_latency_ms"], list)


def test_timeline_pairs_verify_carrier_with_result(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    sample = _load_sample_transcript_str()
    fake_twin.query.return_value = [_row("call-7", sample)]

    r = client.get("/v1/calls/call-7/timeline", headers=auth_headers)
    assert r.status_code == 200
    summary = r.json()["summary"]

    verify_calls = [tc for tc in summary["tool_calls"] if tc["tool_name"] == "verify_carrier"]
    assert len(verify_calls) == 1
    vc = verify_calls[0]
    assert isinstance(vc["args"], dict)
    assert vc["args"].get("mc_number") == "250819"
    # Result was paired in.
    assert vc["result"] is not None
    assert isinstance(vc["result"], dict)
    assert vc["result"]["content"]["carrier"]["legalName"] == "GLK TRUCKING LLC"
    # Timing fields present (started_at always; duration when both ts known).
    assert vc["started_at"] is not None
    assert vc["duration_ms"] is not None
    assert vc["duration_ms"] >= 0


def test_timeline_404_when_transcript_null(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    fake_twin.query.return_value = [_row("call-x", None)]
    r = client.get("/v1/calls/call-x/timeline", headers=auth_headers)
    assert r.status_code == 404
    assert r.json()["detail"] == "transcript not available for this call"


def test_timeline_404_when_call_missing(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    fake_twin.query.return_value = []
    r = client.get("/v1/calls/nope/timeline", headers=auth_headers)
    assert r.status_code == 404


def test_timeline_404_on_malformed_transcript(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    fake_twin.query.return_value = [_row("call-bad", "not-json{{")]
    r = client.get("/v1/calls/call-bad/timeline", headers=auth_headers)
    assert r.status_code == 404


def test_timeline_requires_auth(
    client: TestClient,
    fake_twin: MagicMock,  # noqa: ARG001
) -> None:
    r = client.get("/v1/calls/anything/timeline")
    assert r.status_code == 401


def test_timeline_accepts_list_transcript(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    """Some legacy paths might store transcript as a list rather than a JSON string."""
    sample_list = json.loads(_load_sample_transcript_str())
    fake_twin.query.return_value = [_row("call-list", sample_list)]
    r = client.get("/v1/calls/call-list/timeline", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["summary"]["duration_seconds"] in (184, 185)
