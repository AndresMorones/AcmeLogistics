"""N+1 regression test for `_build_recent_bookings`.

Proves the loop fans out exactly 3 backing calls (bookings window + one
calls_log scan + one loads scan), regardless of booking count. Pre-fix it
fired N+1 queries (one calls_log scan + one load lookup per booking).
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.mark.asyncio
async def test_build_recent_bookings_is_constant_query_count(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routers import dashboard as dash_mod

    bookings = [
        {
            "id": 1,
            "created_at": "2026-04-30T10:00:00Z",
            "call_id": "C-1",
            "mc_number": "111",
            "load_id": "L-1",
            "apply_rate": 2000.0,
        },
        {
            "id": 2,
            "created_at": "2026-04-30T10:05:00Z",
            "call_id": "C-1",  # same call as above (multi-load booking)
            "mc_number": "111",
            "load_id": "L-2",
            "apply_rate": 1750.0,
        },
        {
            "id": 3,
            "created_at": "2026-04-30T10:10:00Z",
            "call_id": "C-2",
            "mc_number": "222",
            "load_id": "L-3",
            "apply_rate": 1900.0,
        },
    ]
    calls = [
        {
            "call_id": "C-1",
            "call_outcome": "load_booked",
            "sentiment": "positive",
            "case_health_score": 88,
            "duration_seconds": 200,
        },
        {
            "call_id": "C-2",
            "call_outcome": "load_booked",
            "sentiment": "neutral",
            "case_health_score": 72,
            "duration_seconds": 145,
        },
        # Noise — extra rows the helper must filter out.
        {"call_id": "C-99", "call_outcome": "no_match"},
    ]
    loads = [
        {
            "load_id": "L-1",
            "origin_city": "Dallas",
            "origin_state": "TX",
            "destination_city": "Atlanta",
            "destination_state": "GA",
            "loadboard_rate": 2100,
        },
        {
            "load_id": "L-2",
            "origin_city": "Phoenix",
            "origin_state": "AZ",
            "destination_city": "Denver",
            "destination_state": "CO",
            "loadboard_rate": 1800,
        },
        {
            "load_id": "L-3",
            "origin_city": "Newark",
            "origin_state": "NJ",
            "destination_city": "Boston",
            "destination_state": "MA",
            "loadboard_rate": 1850,
        },
        # Noise — extra row the helper must filter out.
        {"load_id": "L-99", "loadboard_rate": 9999},
    ]

    monkeypatch.setattr(
        dash_mod,
        "recent_bookings_window",
        AsyncMock(return_value=bookings),
    )
    monkeypatch.setattr(
        dash_mod,
        "list_calls",
        AsyncMock(return_value=calls),
    )
    fake_twin = MagicMock()
    fake_twin.query = AsyncMock(return_value=loads)
    monkeypatch.setattr(
        "app.services.twin_client.twin_client",
        fake_twin,
    )

    result = await dash_mod._build_recent_bookings(
        since_ts="2026-04-30T00:00:00Z",
        limit=50,
    )

    # Three bookings → three rows
    assert result.count == 3
    assert len(result.bookings) == 3

    # Every row got its call + load summary populated from the dicts
    by_id = {row.booking_id: row for row in result.bookings}
    assert by_id[1].call is not None
    assert by_id[1].call.call_outcome == "load_booked"
    assert by_id[1].call.case_health_score == 88
    assert by_id[1].load is not None
    assert by_id[1].load.origin_city == "Dallas"

    assert by_id[2].call is not None
    assert by_id[2].call.case_health_score == 88  # shared call C-1
    assert by_id[2].load is not None
    assert by_id[2].load.origin_city == "Phoenix"

    assert by_id[3].call is not None
    assert by_id[3].call.case_health_score == 72
    assert by_id[3].load is not None
    assert by_id[3].load.origin_city == "Newark"

    # The win — query count is constant regardless of booking count
    assert dash_mod.list_calls.call_count == 1
    assert fake_twin.query.call_count == 1
    sql_arg = fake_twin.query.call_args.args[0]
    assert "FROM loads" in sql_arg
    assert "WHERE" not in sql_arg


@pytest.mark.asyncio
async def test_build_recent_bookings_skips_lookups_when_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routers import dashboard as dash_mod

    monkeypatch.setattr(
        dash_mod,
        "recent_bookings_window",
        AsyncMock(return_value=[]),
    )
    list_calls_mock = AsyncMock()
    monkeypatch.setattr(dash_mod, "list_calls", list_calls_mock)
    fake_twin = MagicMock()
    fake_twin.query = AsyncMock()
    monkeypatch.setattr("app.services.twin_client.twin_client", fake_twin)

    result = await dash_mod._build_recent_bookings(
        since_ts="2026-04-30T00:00:00Z",
        limit=50,
    )

    assert result.count == 0
    assert result.bookings == []
    # No bookings → no follow-up queries fire
    assert list_calls_mock.call_count == 0
    assert fake_twin.query.call_count == 0
