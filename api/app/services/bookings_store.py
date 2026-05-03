"""Read-only `bookings` table accessor.

Writes happen HR-side via the Write-to-Twin component; this module never
mutates. Every query is WAF-safe: fetch-all + Python sort/slice (Cloudflare
WAF in front of Twin blocks ORDER BY+LIMIT). `_normalize` is null-resilient
so schema drift won't crash the dashboard.
"""
from __future__ import annotations

from typing import Any

import structlog

from app.services.dashboard_aggregations import _parse_dt, _to_float as _coerce_float
from app.services.twin_client import twin_client

log = structlog.get_logger()


def _normalize(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "created_at": row.get("created_at"),
        "call_id": row.get("call_id"),
        "mc_number": row.get("mc_number"),
        "load_id": row.get("load_id"),
        "apply_rate": _coerce_float(row.get("apply_rate")),
    }


def _row_dt_key(r: dict[str, Any]):
    # Parsed-datetime sort key — naive string compare fails because Twin
    # returns "2026-04-30 14:23:11+00" (chr 32 space) while ISO inputs use
    # "T" (chr 84), so " " sorts before "T" and dates interleave wrongly.
    return _parse_dt(r.get("created_at")) or _parse_dt("1970-01-01T00:00:00Z")


async def list_bookings(
    *,
    limit: int = 100,
    offset: int = 0,
    since_ts: str | None = None,
) -> list[dict[str, Any]]:
    # Cloudflare WAF blocks ORDER BY+LIMIT/OFFSET and `WHERE created_at >= ...`
    # comparisons. Pull all rows, filter + sort + slice in Python.
    sql = "SELECT id, created_at, call_id, mc_number, load_id, apply_rate FROM bookings"
    rows = await twin_client.query(sql)
    lower = _parse_dt(since_ts) if since_ts else None
    if lower is not None:
        rows = [r for r in rows if (_parse_dt(r.get("created_at")) or lower) >= lower]
    rows.sort(key=_row_dt_key, reverse=True)
    start = int(offset)
    end = start + int(limit)
    return [_normalize(r) for r in rows[start:end]]


async def bookings_by_mc(mc_number: str, *, limit: int = 100) -> list[dict[str, Any]]:
    if not mc_number:
        return []
    # WAF blocks ORDER BY+LIMIT; equality on mc_number is safe but combining with
    # ORDER BY+LIMIT trips the rule. Pull all + filter + sort + slice in Python.
    sql = "SELECT id, created_at, call_id, mc_number, load_id, apply_rate FROM bookings"
    rows = await twin_client.query(sql)
    target = str(mc_number)
    filtered = [r for r in rows if str(r.get("mc_number") or "") == target]
    filtered.sort(key=_row_dt_key, reverse=True)
    return [_normalize(r) for r in filtered[: int(limit)]]


async def recent_bookings_window(
    *,
    since_ts: str,
    until_ts: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    if not since_ts:
        return []
    sql = (
        "SELECT id, created_at, call_id, mc_number, load_id, apply_rate "
        "FROM bookings"
    )
    rows = await twin_client.query(sql)
    lower = _parse_dt(since_ts)
    upper = _parse_dt(until_ts) if until_ts else None

    def _row_dt(r: dict[str, Any]):
        return _parse_dt(r.get("created_at"))

    filtered: list[dict[str, Any]] = []
    for r in rows:
        ca = _row_dt(r)
        if ca is None:
            continue
        if lower is not None and ca < lower:
            continue
        if upper is not None and ca > upper:
            continue
        filtered.append(r)

    filtered.sort(
        key=lambda r: _row_dt(r) or _parse_dt("1970-01-01T00:00:00Z"),
        reverse=True,
    )
    sliced = filtered[: int(limit)] if limit > 0 else filtered
    return [_normalize(r) for r in sliced]


async def all_booked_load_ids() -> set[str]:
    rows = await twin_client.query("SELECT load_id FROM bookings")
    return {str(r.get("load_id")) for r in rows if r.get("load_id")}


async def bookings_for_call(call_id: str) -> list[dict[str, Any]]:
    # WAF false-positive: `WHERE call_id = '<uuid>'` trips Cloudflare's
    # SQL-injection rule on the hex+dash literal. Pull all + filter Python.
    if not call_id:
        return []
    sql = (
        "SELECT id, created_at, call_id, mc_number, load_id, apply_rate "
        "FROM bookings "
        "ORDER BY created_at ASC"
    )
    rows = await twin_client.query(sql)
    target = str(call_id)
    return [_normalize(r) for r in rows if r.get("call_id") == target]
