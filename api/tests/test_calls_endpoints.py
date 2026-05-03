"""GET /v1/calls + GET /v1/calls/{call_id} integration tests with mocked Twin."""

from __future__ import annotations

from unittest.mock import MagicMock

from fastapi.testclient import TestClient


def _row(call_id: str, **overrides) -> dict:
    base = {
        "id": 1,
        "created_at": "2026-04-27T10:00:00Z",
        "call_id": call_id,
        "mc_number": "MC123456",
        "carrier_name": "Acme Trucking",
        "call_outcome": "load_booked",
        "sentiment": "positive",
        "case_health_score": 85,
        "audit_remarks": None,
        "fmcsa_eligibility_failure_reason": None,
        "callback_phone": "+15555550100",
        "duration_seconds": 180,
    }
    base.update(overrides)
    return base


def test_list_calls_returns_rows(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    fake_twin.query.return_value = [
        _row("call-1"),
        _row("call-2", id=2, mc_number="MC222222"),
    ]
    r = client.get("/v1/calls", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    assert len(body["calls"]) == 2
    assert body["calls"][0]["call_id"] == "call-1"
    # Transcript field is intentionally not selected on the list endpoint.
    assert "transcript" not in body["calls"][0]


def test_list_calls_respects_limit(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    fake_twin.query.return_value = []
    r = client.get("/v1/calls?limit=10", headers=auth_headers)
    assert r.status_code == 200
    # Confirm the SQL went through with the limit interpolated.
    sent_sql = fake_twin.query.call_args.args[0]
    sent_params = fake_twin.query.call_args.args[1]
    assert "LIMIT :limit" in sent_sql
    assert sent_params == {"limit": 10}


def test_list_calls_limit_validation(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,  # noqa: ARG001
) -> None:
    r = client.get("/v1/calls?limit=0", headers=auth_headers)
    assert r.status_code == 422
    r2 = client.get("/v1/calls?limit=501", headers=auth_headers)
    assert r2.status_code == 422


def test_list_calls_requires_auth(
    client: TestClient,
    fake_twin: MagicMock,  # noqa: ARG001
) -> None:
    r = client.get("/v1/calls")
    assert r.status_code == 401


def test_list_calls_filters_by_window(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    """When `from`/`to` are supplied the route filters Python-side via
    `_within_window` (Cloudflare WAF blocks SQL date comparisons against
    `created_at`)."""
    fake_twin.query.return_value = [
        _row("call-old", created_at="2026-04-20T10:00:00Z"),
        _row("call-in-1", id=2, created_at="2026-04-29T10:00:00Z"),
        _row("call-in-2", id=3, created_at="2026-04-29T18:00:00Z"),
        _row("call-future", id=4, created_at="2026-05-05T10:00:00Z"),
    ]
    r = client.get(
        "/v1/calls?limit=200&from=2026-04-29T00:00:00Z&to=2026-04-30T00:00:00Z",
        headers=auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    ids = {c["call_id"] for c in body["calls"]}
    assert ids == {"call-in-1", "call-in-2"}


def test_list_calls_no_filter_keeps_fast_path(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    """No bounds → original LIMIT-only SQL with the requested limit (no
    over-pull). Guards the non-filtered call path that powers most dashboard
    KPI tiles."""
    fake_twin.query.return_value = []
    r = client.get("/v1/calls?limit=10", headers=auth_headers)
    assert r.status_code == 200
    sent_params = fake_twin.query.call_args.args[1]
    assert sent_params == {"limit": 10}


def test_get_call_by_id_with_bookings_and_load(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    call_row = _row("call-7")
    call_row["transcript"] = "Hi, this is the carrier..."
    fake_twin.query.side_effect = [
        # get_call_by_id
        [call_row],
        # bookings_for_call
        [
            {
                "id": 11,
                "created_at": "2026-04-27T10:05:00Z",
                "call_id": "call-7",
                "mc_number": "MC123456",
                "load_id": "L-100",
                "apply_rate": "2400.00",
            }
        ],
        # load lane lookup for L-100
        [
            {
                "load_id": "L-100",
                "origin_city": "Dallas",
                "origin_state": "TX",
                "destination_city": "Atlanta",
                "destination_state": "GA",
                "equipment_type": "dry van",
                "loadboard_rate": 2500,
                "miles": 780,
            }
        ],
    ]
    # With `include_transcript=true` the transcript field is returned.
    r = client.get(
        "/v1/calls/call-7?include_transcript=true", headers=auth_headers
    )
    assert r.status_code == 200
    body = r.json()
    assert body["call"]["call_id"] == "call-7"
    assert body["call"]["transcript"].startswith("Hi")
    assert len(body["bookings"]) == 1
    booking = body["bookings"][0]
    assert booking["load_id"] == "L-100"
    assert booking["apply_rate"] == 2400.0
    assert booking["load"]["origin_city"] == "Dallas"
    assert booking["load"]["destination_state"] == "GA"


def test_get_call_by_id_no_bookings(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    fake_twin.query.side_effect = [
        [_row("call-9", call_outcome="call_abandoned")],
        [],  # no bookings
    ]
    r = client.get("/v1/calls/call-9", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["bookings"] == []


def test_get_call_by_id_404(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    fake_twin.query.return_value = []
    r = client.get("/v1/calls/nonexistent", headers=auth_headers)
    assert r.status_code == 404


def test_get_call_by_id_requires_auth(
    client: TestClient,
    fake_twin: MagicMock,  # noqa: ARG001
) -> None:
    r = client.get("/v1/calls/anything")
    assert r.status_code == 401
