"""Tier 1 SQL-backed metric tests — covers M-001/M-080/M-081/M-082/M-010.

Each test pins fake_twin.query to a side_effect list so we verify the SQL
issued (Cloudflare WAF safety) and the value returned.
"""

from unittest.mock import MagicMock

import pytest

from app.services import dashboard_aggregations as agg


@pytest.mark.asyncio
async def test_total_calls(fake_twin: MagicMock) -> None:
    fake_twin.query.return_value = [{"created_at": None}] * 42
    value, basis = await agg.total_calls()
    assert value == 42
    assert basis is None
    sql = fake_twin.query.call_args.args[0]
    assert "FROM calls_log" in sql


@pytest.mark.asyncio
async def test_total_calls_zero_state(fake_twin: MagicMock) -> None:
    fake_twin.query.return_value = []
    value, _ = await agg.total_calls()
    assert value == 0


@pytest.mark.asyncio
async def test_total_bookings(fake_twin: MagicMock) -> None:
    fake_twin.query.return_value = [{"created_at": None}] * 7
    value, _ = await agg.total_bookings()
    assert value == 7


@pytest.mark.asyncio
async def test_calls_without_booking_set_difference(fake_twin: MagicMock) -> None:
    # Cloudflare WAF blocks LEFT JOIN+IS NULL — refactored to two single-table
    # SELECTs and set-difference in Python. First query: calls_log call_ids.
    # Second: bookings call_ids. Diff = calls without a booking.
    fake_twin.query.side_effect = [
        [{"call_id": f"c{i}"} for i in range(1, 11)],  # 10 calls
        [{"call_id": f"c{i}"} for i in range(4, 11)],  # 7 booked → 3 unbooked
    ]
    value, basis = await agg.calls_without_booking()
    assert value == 3
    assert basis == 10
    sqls = [c.args[0] for c in fake_twin.query.call_args_list]
    # Both queries must be WAF-safe: single-table, no LEFT JOIN, no IN-list.
    for sql in sqls:
        assert "LEFT JOIN" not in sql
        assert " IN (" not in sql.upper()
    assert "FROM calls_log" in sqls[0]
    assert "FROM bookings" in sqls[1]


@pytest.mark.asyncio
async def test_calls_without_booking_not_exists_variant(fake_twin: MagicMock) -> None:
    fake_twin.query.side_effect = [
        [{"n": 4}],
        [{"n": 10}],
    ]
    value, basis = await agg.calls_without_booking_not_exists()
    assert value == 4
    assert basis == 10
    first_sql = fake_twin.query.call_args_list[0].args[0]
    assert "NOT EXISTS" in first_sql
    assert " IN (" not in first_sql.upper()


@pytest.mark.asyncio
async def test_bookings_per_booked_call(fake_twin: MagicMock) -> None:
    # Production pulls `SELECT call_id FROM bookings` and counts/distincts in
    # Python (Cloudflare WAF blocks COUNT(*) + COUNT(DISTINCT) in one SELECT).
    # 9 booking rows, 3 distinct call_ids → avg 3.0 bookings/booked-call.
    fake_twin.query.return_value = (
        [{"call_id": "c1"}] * 4
        + [{"call_id": "c2"}] * 3
        + [{"call_id": "c3"}] * 2
    )
    value, basis = await agg.bookings_per_booked_call()
    assert value == 3.0
    assert basis == 3


@pytest.mark.asyncio
async def test_bookings_per_booked_call_handles_zero_division(fake_twin: MagicMock) -> None:
    # Empty bookings table → (None, 0) per the early-return guard.
    fake_twin.query.return_value = []
    value, basis = await agg.bookings_per_booked_call()
    assert value is None
    assert basis == 0


@pytest.mark.asyncio
async def test_revenue_booked(fake_twin: MagicMock) -> None:
    # Production pulls `SELECT apply_rate FROM bookings` and sums in Python
    # (Cloudflare WAF blocks SUM + COUNT in one SELECT).
    fake_twin.query.return_value = [
        {"apply_rate": 1000},
        {"apply_rate": 2000},
        {"apply_rate": 3000},
        {"apply_rate": 3345.67},
        {"apply_rate": 3000},
    ]
    value, basis = await agg.revenue_booked()
    assert value == 12345.67
    assert basis == 5


@pytest.mark.asyncio
async def test_revenue_booked_zero_state(fake_twin: MagicMock) -> None:
    fake_twin.query.return_value = []
    value, basis = await agg.revenue_booked()
    assert value == 0.0
    assert basis == 0


def test_safe_div_zero_denominator() -> None:
    assert agg._safe_div(10, 0) is None
    assert agg._safe_div(None, 5) is None
    assert agg._safe_div(10, None) is None
    assert agg._safe_div(10, 5) == 2.0


def test_safe_count() -> None:
    assert agg._safe_count(None) == 0
    assert agg._safe_count([]) == 0
    assert agg._safe_count([{"a": 1}, None, {"b": 2}]) == 2


@pytest.mark.asyncio
async def test_economics_rate_summary_sql_shape(fake_twin: MagicMock) -> None:
    """Joins bookings to loads in a single statement, no IN-list. Production
    pulls raw join rows and computes 4 aggregates in Python (WAF blocks
    multi-aggregate SELECT)."""
    fake_twin.query.return_value = [
        {"apply_rate": 2000, "loadboard_rate": 2400},
        {"apply_rate": 2000, "loadboard_rate": 2400},
        {"apply_rate": 2500, "loadboard_rate": 2600},
        {"apply_rate": 2500, "loadboard_rate": 2600},
    ]
    result = await agg.economics_rate_summary()
    assert result["avg_loadboard_rate"] == 2500.0
    assert result["avg_agreed_rate"] == 2250.0
    assert result["bookings_count"] == 4
    assert result["total_revenue"] == 9000.0
    sql = fake_twin.query.call_args.args[0]
    assert "FROM bookings b" in sql
    assert "JOIN loads l ON l.load_id = b.load_id" in sql
    assert " IN (" not in sql.upper()


@pytest.mark.asyncio
async def test_economics_rate_summary_zero_state(fake_twin: MagicMock) -> None:
    fake_twin.query.return_value = []
    result = await agg.economics_rate_summary()
    assert result["avg_loadboard_rate"] is None
    assert result["avg_agreed_rate"] is None
    assert result["bookings_count"] == 0
    assert result["total_revenue"] == 0.0


@pytest.mark.asyncio
async def test_operational_summary(fake_twin: MagicMock) -> None:
    # Production pulls raw rows + aggregates in Python (WAF blocks
    # AVG + multiple SUM(CASE) in one SELECT). 10 rows, all 180s, 2 fmcsa
    # fails, 1 abandoned → avg=180, fmcsa_pct=20, abandon_pct=10.
    fake_twin.query.return_value = (
        [{"duration_seconds": 180, "fmcsa_eligibility_failure_reason": "MC_NOT_FOUND", "call_outcome": "broker_declined_ineligible"}] * 2
        + [{"duration_seconds": 180, "fmcsa_eligibility_failure_reason": None, "call_outcome": "call_abandoned"}]
        + [{"duration_seconds": 180, "fmcsa_eligibility_failure_reason": None, "call_outcome": "BOOKED"}] * 7
    )
    result = await agg.operational_summary()
    assert result["avg_duration_seconds"] == 180.0
    assert result["fmcsa_decline_pct"] == 20.0
    assert result["abandon_rate_pct"] == 10.0


@pytest.mark.asyncio
async def test_operational_summary_empty(fake_twin: MagicMock) -> None:
    fake_twin.query.return_value = []
    result = await agg.operational_summary()
    assert result["avg_duration_seconds"] is None
    assert result["fmcsa_decline_pct"] is None
    assert result["abandon_rate_pct"] is None


@pytest.mark.asyncio
async def test_chs_distribution_sql(fake_twin: MagicMock) -> None:
    # Production pulls raw scores + buckets in Python (WAF blocks 5×SUM(CASE)).
    # Distribution: 0+1+2+4+3 = 10 rows across the 5 buckets.
    fake_twin.query.return_value = (
        [{"case_health_score": 30}] * 1   # 20-40
        + [{"case_health_score": 50}] * 2  # 40-60
        + [{"case_health_score": 70}] * 4  # 60-80
        + [{"case_health_score": 90}] * 3  # 80-100
    )
    result = await agg.chs_distribution_sql()
    assert result == {"0-20": 0, "20-40": 1, "40-60": 2, "60-80": 4, "80-100": 3}
