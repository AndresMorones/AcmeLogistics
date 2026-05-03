"""GET /v1/carriers + GET /v1/carriers/{mc_number} integration tests."""

from __future__ import annotations

from unittest.mock import MagicMock

from fastapi.testclient import TestClient


def _stats_query_responses(
    *,
    total_calls: int,
    last_call_at: str | None,
    total_bookings: int,
    avg_apply_rate: float | str | None,
    outcomes: list[dict] | None = None,
    sentiments: list[dict] | None = None,
) -> list[list[dict]]:
    """Build the 4 query responses _carrier_stats() makes, in order."""
    return [
        [{"total_calls": total_calls, "last_call_at": last_call_at}],
        [{"total_bookings": total_bookings, "avg_apply_rate": avg_apply_rate}],
        outcomes if outcomes is not None else [],
        sentiments if sentiments is not None else [],
    ]


def test_get_carrier_aggregates(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    fake_twin.query.side_effect = _stats_query_responses(
        total_calls=4,
        last_call_at="2026-04-27T12:00:00Z",
        total_bookings=2,
        avg_apply_rate="2350.50",
        outcomes=[
            {"call_outcome": "load_booked", "n": 2},
            {"call_outcome": "call_abandoned", "n": 1},
            {"call_outcome": "carrier_not_qualified", "n": 1},
        ],
        sentiments=[
            {"sentiment": "positive", "n": 3},
            {"sentiment": "neutral", "n": 1},
        ],
    )
    r = client.get("/v1/carriers/MC123456", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["mc_number"] == "MC123456"
    assert body["total_calls"] == 4
    assert body["total_bookings"] == 2
    assert body["conversion_rate"] == 0.5
    assert body["avg_apply_rate"] == 2350.5
    assert body["last_call_at"] == "2026-04-27T12:00:00Z"
    assert body["outcome_breakdown"] == {
        "load_booked": 2,
        "carrier_not_qualified": 1,
        "call_abandoned": 1,
        "non_load_booking_engagement": 0,
    }
    assert body["sentiment_breakdown"] == {
        "positive": 3,
        "neutral": 1,
        "negative": 0,
    }


def test_get_carrier_404_when_zero_calls(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    fake_twin.query.side_effect = [
        [{"total_calls": 0, "last_call_at": None}],
    ]
    r = client.get("/v1/carriers/MC999999", headers=auth_headers)
    assert r.status_code == 404
    assert "MC999999" in r.json()["detail"]


def test_get_carrier_no_bookings_avg_rate_null(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    fake_twin.query.side_effect = _stats_query_responses(
        total_calls=2,
        last_call_at="2026-04-27T10:00:00Z",
        total_bookings=0,
        avg_apply_rate=None,
        outcomes=[{"call_outcome": "call_abandoned", "n": 2}],
        sentiments=[],
    )
    r = client.get("/v1/carriers/MC222222", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total_bookings"] == 0
    assert body["conversion_rate"] == 0.0
    assert body["avg_apply_rate"] is None


def test_get_carrier_requires_auth(
    client: TestClient,
    fake_twin: MagicMock,  # noqa: ARG001
) -> None:
    r = client.get("/v1/carriers/MC123")
    assert r.status_code == 401


def test_list_carriers_returns_rollups(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    # WAF-safe rollup uses 2 bulk pulls: calls_log + bookings.
    fake_twin.query.side_effect = [
        # calls_log bulk
        [
            {
                "mc_number": "MC100",
                "created_at": "2026-04-27T08:00:00Z",
                "call_outcome": "load_booked",
                "sentiment": "positive",
            },
            {
                "mc_number": "MC100",
                "created_at": "2026-04-27T09:00:00Z",
                "call_outcome": "load_booked",
                "sentiment": "positive",
            },
            {
                "mc_number": "MC100",
                "created_at": "2026-04-27T07:00:00Z",
                "call_outcome": "call_abandoned",
                "sentiment": None,
            },
            {
                "mc_number": "MC200",
                "created_at": "2026-04-27T10:00:00Z",
                "call_outcome": "call_abandoned",
                "sentiment": None,
            },
            {
                "mc_number": "MC200",
                "created_at": "2026-04-27T11:00:00Z",
                "call_outcome": "call_abandoned",
                "sentiment": None,
            },
        ],
        # bookings bulk
        [
            {"mc_number": "MC100", "apply_rate": "2100.00"},
            {"mc_number": "MC100", "apply_rate": "2300.00"},
        ],
    ]
    r = client.get("/v1/carriers?limit=10", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    assert body["carriers"][0]["mc_number"] == "MC100"
    assert body["carriers"][0]["conversion_rate"] == round(2 / 3, 4)
    assert body["carriers"][0]["avg_apply_rate"] == 2200.00
    assert body["carriers"][1]["mc_number"] == "MC200"
    assert body["carriers"][1]["total_bookings"] == 0


def test_list_carriers_empty(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    fake_twin.query.return_value = []
    r = client.get("/v1/carriers", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body == {"carriers": [], "count": 0}


def test_list_carriers_requires_auth(
    client: TestClient,
    fake_twin: MagicMock,  # noqa: ARG001
) -> None:
    r = client.get("/v1/carriers")
    assert r.status_code == 401


def test_list_carriers_limit_validation(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,  # noqa: ARG001
) -> None:
    r = client.get("/v1/carriers?limit=0", headers=auth_headers)
    assert r.status_code == 422
