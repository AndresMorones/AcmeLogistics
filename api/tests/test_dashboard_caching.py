"""TTL cache wrapping tests for the SQL-backed dashboard aggregations.

The 9 hot-path aggregation functions go through `_cached_call` so a dashboard
endpoint render hits Twin once per 30s window instead of every browser refresh.
These tests pin down:

1. Within the TTL, repeated calls hit Twin exactly once.
2. `invalidate_dashboard_cache()` flushes the cache and forces a re-fetch.
3. Different aggregation functions don't collide on cache keys.
"""

from unittest.mock import MagicMock

import pytest

from app.services import dashboard_aggregations as agg


@pytest.mark.asyncio
async def test_total_calls_caches_within_ttl(fake_twin: MagicMock) -> None:
    """Two back-to-back calls inside the TTL window → only one Twin query."""
    fake_twin.query.return_value = [{"created_at": None}] * 17

    first_value, _ = await agg.total_calls()
    second_value, _ = await agg.total_calls()

    assert first_value == 17
    assert second_value == 17
    assert fake_twin.query.call_count == 1


@pytest.mark.asyncio
async def test_invalidate_dashboard_cache_clears(fake_twin: MagicMock) -> None:
    """After explicit invalidation, the next call must re-issue the SQL."""
    fake_twin.query.return_value = [{"created_at": None}] * 5

    await agg.total_calls()
    assert fake_twin.query.call_count == 1

    agg.invalidate_dashboard_cache()

    await agg.total_calls()
    assert fake_twin.query.call_count == 2


@pytest.mark.asyncio
async def test_cache_isolation_between_functions(fake_twin: MagicMock) -> None:
    """Different aggregation functions must not share cache entries.

    `total_calls` and `total_bookings` both pull `created_at` rows from
    different tables — if they collided on the cache key, the second function
    would silently return the first one's result.
    """
    fake_twin.query.side_effect = [
        [{"created_at": None}] * 100,  # total_calls
        [{"created_at": None}] * 7,    # total_bookings
    ]

    calls_value, _ = await agg.total_calls()
    bookings_value, _ = await agg.total_bookings()

    assert calls_value == 100
    assert bookings_value == 7
    assert fake_twin.query.call_count == 2


@pytest.mark.asyncio
async def test_economics_rate_summary_is_cached(fake_twin: MagicMock) -> None:
    """Economics rendering issues a single multi-column JOIN — cache covers it
    too so the dashboard /economics page survives a refresh storm."""
    fake_twin.query.return_value = [{
        "avg_loadboard_rate": "2500.00",
        "avg_agreed_rate": "2250.00",
        "bookings_count": 4,
        "total_revenue": "9000.00",
    }]

    first = await agg.economics_rate_summary()
    second = await agg.economics_rate_summary()

    assert first == second
    assert fake_twin.query.call_count == 1


@pytest.mark.asyncio
async def test_all_nine_wrapped_functions_are_cached(fake_twin: MagicMock) -> None:
    """Sanity check: every function the prompt named goes through the cache.

    Each function is called twice; each must hit Twin only the first time.
    Because some functions issue 2 SQL statements (e.g. calls_without_booking)
    we record the call count *delta* per function rather than the absolute.
    """
    # Default response that satisfies every shape we care about (extra keys
    # are ignored by the aggregations, missing keys default to 0/None).
    fake_twin.query.return_value = [{
        "n": 0,
        "bookings_n": 0,
        "booked_calls_n": 0,
        "rev": 0,
        "avg_loadboard_rate": None,
        "avg_agreed_rate": None,
        "bookings_count": 0,
        "total_revenue": None,
        "avg_chs": None,
        "avg_dur": None,
        "fmcsa_fail": 0,
        "abandoned": 0,
        "total": 0,
        "b0": 0, "b1": 0, "b2": 0, "b3": 0, "b4": 0,
        "call_outcome": "load_booked",
        "sentiment": "positive",
    }]

    wrapped = [
        agg.total_calls,
        agg.total_bookings,
        agg.calls_without_booking,
        agg.outcome_distribution,
        agg.economics_rate_summary,
        agg.operational_summary,
        agg.sentiment_distribution,
        agg.avg_case_health,
        agg.chs_distribution_sql,
    ]

    for fn in wrapped:
        agg.invalidate_dashboard_cache()
        before = fake_twin.query.call_count
        await fn()
        cold = fake_twin.query.call_count - before
        await fn()
        warm = fake_twin.query.call_count - before - cold
        assert cold >= 1, f"{fn.__name__} should hit Twin on the cold call"
        assert warm == 0, f"{fn.__name__} should be served from cache on the warm call"


def test_dashboard_cache_stats_shape() -> None:
    stats = agg.dashboard_cache_stats()
    assert set(stats.keys()) == {"currsize", "maxsize", "ttl_seconds"}
    assert stats["ttl_seconds"] == 30
    assert stats["maxsize"] == 512
